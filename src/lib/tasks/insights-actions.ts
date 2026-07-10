"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/users/actions";
import {
  detectRoutines,
  onboardingThemes,
  similarity,
  type ClusterItem,
  type OnboardingItem,
  type RoutineCandidate,
  type OnboardingTheme,
} from "./clustering";

function todaySp(): string {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

// ── Lente 1: detector de rotinas ─────────────────────────────────────────────

export type RoutineCandidateRow = RoutineCandidate & { clinicName: string | null };

/**
 * Rotinas candidatas: clusters de tarefas similares com cadência regular nos
 * últimos 120 dias. Exclui: ocorrências de regras existentes (senão a própria
 * regra "é detectada"), clusters já rejeitados e clusters já cobertos por uma
 * regra ativa parecida.
 */
export async function listRoutineCandidates(): Promise<
  { ok: true; candidates: RoutineCandidateRow[] } | { ok: false; error: string }
> {
  try {
    if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
    const supabase = await createClient();

    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const [{ data: tasks, error }, { data: dismissals }, { data: rules }, { data: clinics }] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, clinic_id, created_at")
          .is("recurrence_id", null)
          .gte("created_at", since),
        supabase.from("recurrence_dismissals").select("signature"),
        supabase.from("task_recurrences").select("title, clinic_id, all_clinics").eq("active", true),
        supabase.from("clinics").select("id, name"),
      ]);
    if (error) return { ok: false as const, error: error.message };

    const items: ClusterItem[] = (tasks ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      clinicId: (t.clinic_id as string | null) ?? null,
      day: (t.created_at as string).slice(0, 10),
    }));

    const dismissed = new Set((dismissals ?? []).map((d) => d.signature as string));
    const nameById = new Map((clinics ?? []).map((c) => [c.id as string, c.name as string]));

    const candidates = detectRoutines(items, todaySp())
      .filter((c) => !dismissed.has(c.signature))
      // já coberta por uma regra ativa parecida (mesma clínica ou fan-out)?
      .filter(
        (c) =>
          !(rules ?? []).some(
            (r) =>
              (r.all_clinics || (r.clinic_id as string | null) === c.clinicId) &&
              similarity(r.title as string, c.title) >= 0.5,
          ),
      )
      .slice(0, 12)
      .map((c) => ({ ...c, clinicName: c.clinicId ? (nameById.get(c.clinicId) ?? null) : null }));

    return { ok: true as const, candidates };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao detectar rotinas" };
  }
}

/** Rejeita um cluster — não volta a ser sugerido (memória persistida). */
export async function dismissRoutine(
  signature: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurrence_dismissals")
    .upsert({ signature, dismissed_by: user.id }, { onConflict: "signature" });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ── Lente 2: diagnóstico pós-onboarding ─────────────────────────────────────

export type OnboardingThemeRow = Omit<OnboardingTheme, "clinicIds"> & { clinicNames: string[] };

/**
 * Temas de tarefa que se repetem em ≥2 clínicas nos primeiros 30 dias de vida
 * (âncora: onboarded_at, com fallback em created_at). Cada tema é um candidato
 * a defeito do processo de implantação — a correção vira item do checklist.
 */
export async function postOnboardingDiagnostic(): Promise<
  { ok: true; themes: OnboardingThemeRow[]; clinicsAnalyzed: number } | { ok: false; error: string }
> {
  try {
    if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };
    if ((await getCurrentProfile())?.role !== "gestor")
      return { ok: false as const, error: "Diagnóstico disponível apenas para o gestor" };

    const supabase = await createClient();
    const [{ data: clinics, error: cErr }, { data: tasks, error: tErr }] = await Promise.all([
      supabase.from("clinics").select("id, name, onboarded_at, created_at"),
      supabase
        .from("tasks")
        .select("id, title, clinic_id, created_at")
        .not("clinic_id", "is", null)
        .is("recurrence_id", null),
    ]);
    if (cErr) return { ok: false as const, error: cErr.message };
    if (tErr) return { ok: false as const, error: tErr.message };

    const anchorByClinic = new Map<string, number>();
    const nameById = new Map<string, string>();
    for (const c of clinics ?? []) {
      const anchor = (c.onboarded_at as string | null) ?? (c.created_at as string).slice(0, 10);
      anchorByClinic.set(c.id as string, Date.parse(`${anchor}T00:00:00Z`));
      nameById.set(c.id as string, c.name as string);
    }

    const WINDOW_DAYS = 30;
    const items: OnboardingItem[] = [];
    for (const t of tasks ?? []) {
      const anchor = anchorByClinic.get(t.clinic_id as string);
      if (anchor === undefined) continue;
      const created = Date.parse(t.created_at as string);
      const dayOfLife = Math.floor((created - anchor) / 86_400_000);
      if (dayOfLife < 0 || dayOfLife > WINDOW_DAYS) continue;
      items.push({
        id: t.id as string,
        title: t.title as string,
        clinicId: t.clinic_id as string,
        day: (t.created_at as string).slice(0, 10),
        dayOfLife,
      });
    }

    const themes = onboardingThemes(items).map((th) => ({
      title: th.title,
      clinicsCount: th.clinicsCount,
      dayRange: th.dayRange,
      examples: th.examples,
      clinicNames: th.clinicIds.map((id) => nameById.get(id) ?? "—"),
    }));

    return {
      ok: true as const,
      themes,
      clinicsAnalyzed: new Set(items.map((i) => i.clinicId)).size,
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Falha no diagnóstico" };
  }
}
