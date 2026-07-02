"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken, decryptToken } from "@/lib/crypto/token";
import { createCompany, createCompanyToken } from "@/lib/helena/admin";
import { createAgent, createDepartment, createContact, listPanels } from "@/lib/helena/client";
import { DEFAULT_TEAMS, DEFAULT_TAGS, SEED_CONTACT_NAME } from "@/lib/helena/provision-defaults";
import { PROVISION_STEPS, type ProvisionStep, type ProvisionRow } from "./provision-schema";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

type Service = ReturnType<typeof createServiceClient>;

async function record(
  db: Service,
  clinicId: string,
  step: ProvisionStep,
  status: ProvisionRow["status"],
  detail: string | null,
) {
  await db.from("clinic_provisioning").upsert(
    {
      clinic_id: clinicId,
      step,
      status,
      detail,
      executed_at: new Date().toISOString(),
    },
    { onConflict: "clinic_id,step" },
  );
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listProvisioning(clinicId: string): Promise<ProvisionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_provisioning")
    .select("step, status, detail, executed_at")
    .eq("clinic_id", clinicId);
  if (error) throw new Error(error.message);
  const byStep = new Map((data ?? []).map((r) => [r.step as ProvisionStep, r as ProvisionRow]));
  // devolve na ordem canônica (só as etapas já registradas)
  return PROVISION_STEPS.filter((s) => byStep.has(s)).map((s) => byStep.get(s)!);
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Executa (ou re-executa) o provisionamento da clínica na Helena.
 * Idempotente: etapas 'done' são puladas; 'error'/'manual'/'pending' re-executam.
 * Ordem: conta → token → usuário do dono → equipes → tags → painel (detecção).
 */
export async function runProvisioning(
  clinicId: string,
): Promise<{ ok: true; rows: ProvisionRow[] } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth) return { ok: false, error: "Não autenticado" };

  const db = createServiceClient();

  const { data: clinic, error: clinicError } = await db
    .from("clinics")
    .select("id, name, city, state, legal_name, document_id, owner_name, owner_email, owner_phone, mode")
    .eq("id", clinicId)
    .single();
  if (clinicError || !clinic) return { ok: false, error: "Clínica não encontrada" };

  const { data: existingRows } = await db
    .from("clinic_provisioning")
    .select("step, status, detail")
    .eq("clinic_id", clinicId);
  const statusOf = new Map(
    (existingRows ?? []).map((r) => [r.step as ProvisionStep, r as { status: string; detail: string | null }]),
  );
  const isDone = (s: ProvisionStep) => statusOf.get(s)?.status === "done";

  const { data: integration } = await db
    .from("clinic_integrations")
    .select("helena_token_encrypted, company_id, panel_id")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  // ── 1. account ─────────────────────────────────────────────────────────────
  let companyId: string | null =
    (integration?.company_id as string | null) ??
    (isDone("account") ? (statusOf.get("account")?.detail ?? null) : null);

  if (!companyId) {
    const masterToken = (process.env.HELENA_MASTER_TOKEN ?? "").trim();
    if (!masterToken) {
      await record(db, clinicId, "account", "error", "HELENA_MASTER_TOKEN não configurado no ambiente");
      revalidatePath(`/clinicas/${clinicId}`);
      return { ok: true, rows: await listProvisioning(clinicId) };
    }
    try {
      const company = await createCompany(masterToken, {
        name: clinic.name,
        legalName: clinic.legal_name,
        documentId: clinic.document_id,
        owner: {
          name: clinic.owner_name,
          email: clinic.owner_email,
          phoneNumber: clinic.owner_phone,
        },
        city: clinic.city,
        state: clinic.state,
      });
      companyId = company.id;
      await record(db, clinicId, "account", "done", companyId);
    } catch (e) {
      await record(db, clinicId, "account", "error", (e as Error).message);
      revalidatePath(`/clinicas/${clinicId}`);
      return { ok: true, rows: await listProvisioning(clinicId) };
    }
  } else if (!isDone("account")) {
    await record(db, clinicId, "account", "done", companyId);
  }

  // ── 2. token ───────────────────────────────────────────────────────────────
  let clinicToken: string | null = integration?.helena_token_encrypted
    ? decryptToken(integration.helena_token_encrypted as string)
    : null;

  if (!clinicToken) {
    const masterToken = (process.env.HELENA_MASTER_TOKEN ?? "").trim();
    try {
      clinicToken = await createCompanyToken(masterToken, companyId);
      const { error } = await db.from("clinic_integrations").upsert(
        {
          clinic_id: clinicId,
          helena_token_encrypted: encryptToken(clinicToken),
          company_id: companyId,
          panel_id: integration?.panel_id ?? null,
          last_sync_at: new Date().toISOString(),
        },
        { onConflict: "clinic_id" },
      );
      if (error) throw new Error(error.message);
      await record(db, clinicId, "token", "done", "token permanente gerado e cifrado");
    } catch (e) {
      await record(db, clinicId, "token", "error", (e as Error).message);
      revalidatePath(`/clinicas/${clinicId}`);
      return { ok: true, rows: await listProvisioning(clinicId) };
    }
  } else if (!isDone("token")) {
    await record(db, clinicId, "token", "done", "token já existente reutilizado");
  }

  // ── 3. owner_user ──────────────────────────────────────────────────────────
  if (!isDone("owner_user")) {
    if (!clinic.owner_email) {
      await record(db, clinicId, "owner_user", "done", "sem e-mail do dono — etapa pulada");
    } else {
      try {
        await createAgent(clinicToken, {
          name: clinic.owner_name || clinic.name,
          email: clinic.owner_email,
          phoneNumber: clinic.owner_phone,
          profile: "Admin",
        });
        await record(db, clinicId, "owner_user", "done", `${clinic.owner_email} criado como Admin`);
      } catch (e) {
        await record(db, clinicId, "owner_user", "error", (e as Error).message);
      }
    }
  }

  // ── 4. teams ───────────────────────────────────────────────────────────────
  if (!isDone("teams")) {
    const failures: string[] = [];
    for (const name of DEFAULT_TEAMS) {
      try {
        await createDepartment(clinicToken, { name });
      } catch (e) {
        failures.push(`${name}: ${(e as Error).message}`);
      }
    }
    if (failures.length === 0) {
      await record(db, clinicId, "teams", "done", DEFAULT_TEAMS.join(" + "));
    } else {
      await record(db, clinicId, "teams", "error", failures.join(" | "));
    }
  }

  // ── 5. tags ────────────────────────────────────────────────────────────────
  if (!isDone("tags")) {
    if (DEFAULT_TAGS.length === 0) {
      await record(db, clinicId, "tags", "done", "nenhuma tag padrão configurada");
    } else {
      try {
        await createContact(clinicToken, {
          name: SEED_CONTACT_NAME,
          tagNames: DEFAULT_TAGS,
          annotation: "Contato criado pelo Clinic Control para materializar as etiquetas padrão.",
        });
        await record(db, clinicId, "tags", "done", DEFAULT_TAGS.join(", "));
      } catch (e) {
        await record(db, clinicId, "tags", "error", (e as Error).message);
      }
    }
  }

  // ── 6. panel (detecção — criação é manual na UI da Helena) ────────────────
  if (!isDone("panel")) {
    try {
      const panels = await listPanels(clinicToken);
      if (panels.length > 0) {
        const panel = panels[0];
        await db
          .from("clinic_integrations")
          .update({ panel_id: panel.id, company_id: panel.companyId ?? companyId })
          .eq("clinic_id", clinicId);
        await db.from("clinics").update({ mode: "auto" }).eq("id", clinicId);
        await record(db, clinicId, "panel", "done", `painel "${panel.title}" vinculado — clínica em modo auto`);
      } else {
        await record(
          db,
          clinicId,
          "panel",
          "manual",
          "Crie o painel de CRM na plataforma da Helena e clique em Reprocessar — o app detecta e vincula sozinho.",
        );
      }
    } catch (e) {
      await record(db, clinicId, "panel", "error", (e as Error).message);
    }
  }

  revalidatePath(`/clinicas/${clinicId}`);
  revalidatePath("/clinicas");
  return { ok: true, rows: await listProvisioning(clinicId) };
}
