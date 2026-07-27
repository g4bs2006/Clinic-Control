"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireGestor } from "@/lib/auth/require-gestor";
import type { PartnerContact, PartnerRole } from "./partner-contacts";

const SELECT = "id, role, name, email, phone, position, active";

/** Todos os contatos (inclui inativos — a tela de edição precisa deles). */
export async function listPartnerContacts(): Promise<PartnerContact[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_contacts")
    .select(SELECT)
    .order("role")
    .order("position")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as PartnerContact[];
}

export async function createPartnerContact(input: {
  role: PartnerRole;
  name: string;
  email?: string;
  phone?: string;
}): Promise<{ ok: true; contact: PartnerContact } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return { ok: false, error: gate.error };

  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Nome muito curto" };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("partner_contacts")
    .select("position")
    .eq("role", input.role)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("partner_contacts")
    .insert({
      role: input.role,
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      position,
    })
    .select(SELECT)
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe alguém com esse nome nesse papel" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/configuracoes");
  return { ok: true, contact: data as PartnerContact };
}

export async function updatePartnerContact(
  id: string,
  patch: { name?: string; email?: string | null; phone?: string | null; active?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (patch.email !== undefined) update.email = (patch.email ?? "").trim() || null;
  if (patch.phone !== undefined) update.phone = (patch.phone ?? "").trim() || null;
  if (patch.active !== undefined) update.active = patch.active;

  // Renomear propaga para as clínicas que referenciam o nome antigo (a clínica
  // guarda o NOME, não um id) — senão o vínculo se perde. Estrategista vive num
  // array (clinics.strategists); gestor de tráfego numa coluna única.
  let rename: { role: PartnerRole; from: string; to: string } | null = null;
  if (patch.name !== undefined) {
    const to = patch.name.trim();
    if (to.length < 2) return { ok: false, error: "Nome muito curto" };
    const { data: current } = await supabase
      .from("partner_contacts")
      .select("role, name")
      .eq("id", id)
      .maybeSingle();
    if (current && (current.name as string) !== to) {
      rename = { role: current.role as PartnerRole, from: current.name as string, to };
    }
    update.name = to;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("partner_contacts").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe alguém com esse nome nesse papel" };
    return { ok: false, error: error.message };
  }

  if (rename) {
    if (rename.role === "strategist") {
      // Troca o nome dentro do array de estrategistas de cada clínica afetada.
      const { data: affected } = await supabase
        .from("clinics")
        .select("id, strategists")
        .contains("strategists", [rename.from]);
      for (const c of affected ?? []) {
        const next = ((c.strategists as string[]) ?? []).map((s) => (s === rename!.from ? rename!.to : s));
        await supabase.from("clinics").update({ strategists: next }).eq("id", c.id);
      }
    } else {
      await supabase
        .from("clinics")
        .update({ traffic_manager: rename.to })
        .eq("traffic_manager", rename.from);
    }
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function deletePartnerContact(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireGestor();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("partner_contacts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracoes");
  return { ok: true };
}
