"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/users/actions";
import { lastDue, type RecurrenceFreq } from "./recurrence";
import type { TaskCategory, TaskPriority } from "./categories";

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskRecurrenceRow = {
  id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  freq: RecurrenceFreq;
  weekday: number | null;
  monthday: number | null;
  clinic_id: string | null;
  clinic_name: string | null;
  all_clinics: boolean;
  assigned_to: string | null;
  assigned_to_name: string | null;
  active: boolean;
  created_by: string | null;
};

const SELECT =
  "id, title, description, category, priority, freq, weekday, monthday, clinic_id, all_clinics, assigned_to, active, created_by, clinics(name), assignee:app_users!assigned_to(name)";

type SingleOrArray<T> = T | T[] | null;
function unwrapName(v: SingleOrArray<{ name: string | null }>): string | null {
  if (!v) return null;
  return (Array.isArray(v) ? v[0]?.name : v.name) ?? null;
}

function mapRow(row: Record<string, unknown>): TaskRecurrenceRow {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    category: row.category as TaskCategory,
    priority: row.priority as TaskPriority,
    freq: row.freq as RecurrenceFreq,
    weekday: (row.weekday as number | null) ?? null,
    monthday: (row.monthday as number | null) ?? null,
    clinic_id: (row.clinic_id as string | null) ?? null,
    clinic_name: unwrapName(row.clinics as SingleOrArray<{ name: string | null }>),
    all_clinics: row.all_clinics as boolean,
    assigned_to: (row.assigned_to as string | null) ?? null,
    assigned_to_name: unwrapName(row.assignee as SingleOrArray<{ name: string | null }>),
    active: row.active as boolean,
    created_by: (row.created_by as string | null) ?? null,
  };
}

/** Data de hoje no fuso operacional (America/Sao_Paulo). */
function todaySp(): string {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listRecurrences(): Promise<TaskRecurrenceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_recurrences")
    .select(SELECT)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export type RecurrenceInput = {
  id?: string;
  title: string;
  description?: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  freq: RecurrenceFreq;
  weekday?: number | null;
  monthday?: number | null;
  /** Uma clínica específica (exclusivo com allClinics). */
  clinicId?: string | null;
  /** Fan-out: uma tarefa por clínica ativa, responsável = dev da carteira. */
  allClinics?: boolean;
  assignedTo?: string | null;
};

export async function upsertRecurrence(
  input: RecurrenceInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const title = input.title.trim();
  if (title.length < 3) return { ok: false, error: "Título muito curto" };
  if (input.freq === "semanal" && (input.weekday == null || input.weekday < 0 || input.weekday > 6))
    return { ok: false, error: "Escolha o dia da semana" };
  if (input.freq === "mensal" && (input.monthday == null || input.monthday < 1 || input.monthday > 31))
    return { ok: false, error: "Escolha o dia do mês (1 a 31)" };

  const allClinics = input.allClinics ?? false;
  if (allClinics) {
    const profile = await getCurrentProfile();
    if (profile?.role !== "gestor")
      return { ok: false, error: "Regras para todas as clínicas são criadas pelo gestor" };
  }

  const payload = {
    title,
    description: input.description?.trim() || null,
    category: input.category,
    priority: input.priority,
    freq: input.freq,
    weekday: input.freq === "semanal" ? input.weekday : null,
    monthday: input.freq === "mensal" ? input.monthday : null,
    clinic_id: allClinics ? null : (input.clinicId ?? null),
    all_clinics: allClinics,
    assigned_to: input.assignedTo ?? null,
  };

  const supabase = await createClient();
  const { data, error } = input.id
    ? await supabase.from("task_recurrences").update(payload).eq("id", input.id).select("id").single()
    : await supabase
        .from("task_recurrences")
        .insert({ ...payload, created_by: user.id })
        .select("id")
        .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tarefas");
  return { ok: true, id: data.id as string };
}

export async function setRecurrenceActive(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };
  const supabase = await createClient();
  const { error } = await supabase.from("task_recurrences").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tarefas");
  return { ok: true };
}

export async function deleteRecurrence(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionUser())) return { ok: false, error: "Não autenticado" };
  // Ocorrências já criadas ficam (FK on delete set null) — só a série morre.
  const supabase = await createClient();
  const { error } = await supabase.from("task_recurrences").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tarefas");
  return { ok: true };
}

// ── Materializador (sob demanda) ─────────────────────────────────────────────

/**
 * Materializa as ocorrências devidas das regras ativas. Chamado na abertura de
 * /tarefas e do dashboard — idempotente (índice único regra+data+clínica) e com
 * ANTI-EMPILHAMENTO: se a ocorrência anterior da regra (mesma clínica) segue
 * aberta, não cria duplicata. Nunca lança: falha aqui não pode quebrar a página.
 */
export async function materializeRecurrences(): Promise<void> {
  try {
    if (!(await getSessionUser())) return;
    const supabase = await createClient();

    const { data: rules } = await supabase
      .from("task_recurrences")
      .select("id, title, description, category, priority, freq, weekday, monthday, clinic_id, all_clinics, assigned_to, created_by")
      .eq("active", true);
    if (!rules || rules.length === 0) return;

    const today = todaySp();
    const dueByRule = new Map<string, string>();
    for (const r of rules) {
      const due = lastDue(
        { freq: r.freq as RecurrenceFreq, weekday: r.weekday as number | null, monthday: r.monthday as number | null },
        today,
      );
      if (due) dueByRule.set(r.id as string, due);
    }
    if (dueByRule.size === 0) return;

    // Clínicas ativas (para regras de fan-out) — dev da carteira vira responsável.
    const needFanout = rules.some((r) => r.all_clinics);
    let activeClinics: { id: string; developer_id: string | null }[] = [];
    if (needFanout) {
      const { data } = await supabase
        .from("clinics")
        .select("id, developer_id")
        .eq("contract_status", "active");
      activeClinics = (data ?? []) as typeof activeClinics;
    }

    const ruleIds = [...dueByRule.keys()];
    // Ocorrências existentes (qualquer data devida) + abertas (anti-empilhamento).
    const [{ data: existing }, { data: open }] = await Promise.all([
      supabase
        .from("tasks")
        .select("recurrence_id, recurrence_date, clinic_id")
        .in("recurrence_id", ruleIds)
        .in("recurrence_date", [...new Set(dueByRule.values())]),
      supabase
        .from("tasks")
        .select("recurrence_id, clinic_id")
        .in("recurrence_id", ruleIds)
        .in("status", ["pendente", "em_andamento"]),
    ]);

    const key = (rid: string, cid: string | null, date?: string) =>
      `${rid}|${cid ?? "-"}${date ? `|${date}` : ""}`;
    const existingKeys = new Set(
      (existing ?? []).map((t) => key(t.recurrence_id as string, t.clinic_id as string | null, t.recurrence_date as string)),
    );
    const openKeys = new Set((open ?? []).map((t) => key(t.recurrence_id as string, t.clinic_id as string | null)));

    type Insert = Record<string, unknown>;
    const inserts: Insert[] = [];
    for (const r of rules) {
      const due = dueByRule.get(r.id as string);
      if (!due) continue;
      const targets: { clinicId: string | null; assignee: string | null }[] = r.all_clinics
        ? activeClinics.map((c) => ({
            clinicId: c.id,
            assignee: c.developer_id ?? (r.assigned_to as string | null) ?? (r.created_by as string | null),
          }))
        : [{
            clinicId: (r.clinic_id as string | null) ?? null,
            assignee: (r.assigned_to as string | null) ?? (r.created_by as string | null),
          }];

      for (const t of targets) {
        if (existingKeys.has(key(r.id as string, t.clinicId, due))) continue; // já materializada
        if (openKeys.has(key(r.id as string, t.clinicId))) continue; // anterior aberta — não empilha
        inserts.push({
          clinic_id: t.clinicId,
          title: r.title,
          description: r.description,
          category: r.category,
          priority: r.priority,
          status: "pendente",
          assigned_to: t.assignee,
          due_date: due,
          source: "manual",
          created_by: r.created_by,
          recurrence_id: r.id,
          recurrence_date: due,
        });
      }
    }

    // Insert por linha: corrida entre aberturas simultâneas cai no índice único
    // (23505) e é ignorada sem derrubar o lote inteiro.
    for (const row of inserts) {
      const { error } = await supabase.from("tasks").insert(row);
      if (error && error.code !== "23505") {
        console.error("[materializeRecurrences] insert falhou:", error.message);
      }
    }
  } catch (e) {
    console.error("[materializeRecurrences] erro inesperado:", e);
  }
}
