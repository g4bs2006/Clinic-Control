// One-off (2026-07-29): traz a configuração da automação de agendamento que vivia
// só em `public.automacao_clinicas` (mantida à mão, lida pelo n8n) para dentro do
// clinic_control, que passa a ser a fonte da verdade.
//
// O que faz:
//   1. casa cada linha do n8n com uma clínica por `helena_company_id`
//      (= clinic_integrations.company_id — casou 1:1 nas 21 linhas em 29/07);
//   2. copia os campos para clinic_integrations SEM sobrescrever o que já estiver
//      preenchido lá;
//   3. RELATA as divergências em vez de resolver no escuro — nome trocado,
//      panel_id diferente, linha órfã.
//
// Por padrão roda em modo SECO (não escreve nada). Para aplicar: --aplicar
//
//   npx tsx scripts/import-automacao-clinicas.mts
//   npx tsx scripts/import-automacao-clinicas.mts --aplicar
//
// (usa NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--aplicar");

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cc = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "clinic_control" },
});
const pub = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

/** coluna no n8n → coluna em clinic_integrations */
const FIELD_MAP: Record<string, string> = {
  step_id: "automation_lead_step_id",
  agendado_step_id: "automation_scheduled_step_id",
  cancelado_step_id: "automation_cancelled_step_id",
  ia_card_tag_id: "automation_ia_card_tag_id",
  agendado_contact_tag_id: "automation_scheduled_contact_tag_id",
  agendado_em_field_key: "automation_scheduled_at_field_key",
  agendado_para_field_key: "automation_scheduled_for_field_key",
  fb_panel_tag_id: "automation_fb_panel_tag_id",
  fb_contact_tag_id: "automation_fb_contact_tag_id",
  ig_panel_tag_id: "automation_ig_panel_tag_id",
  ig_contact_tag_id: "automation_ig_contact_tag_id",
  org_panel_tag_id: "automation_org_panel_tag_id",
  org_contact_tag_id: "automation_org_contact_tag_id",
};

type Row = Record<string, string | boolean | null>;

const { data: mirror, error: mirrorErr } = await pub.from("automacao_clinicas").select("*");
if (mirrorErr) throw new Error(`automacao_clinicas: ${mirrorErr.message}`);

const { data: integrations, error: integErr } = await cc
  .from("clinic_integrations")
  .select("clinic_id, company_id, panel_id, automation_enabled, " + Object.values(FIELD_MAP).join(", "));
if (integErr) throw new Error(`clinic_integrations: ${integErr.message}`);

const { data: clinics, error: clinicErr } = await cc.from("clinics").select("id, name");
if (clinicErr) throw new Error(`clinics: ${clinicErr.message}`);

const nameById = new Map((clinics ?? []).map((c) => [c.id as string, c.name as string]));
// Cast explícito: o supabase-js só infere o tipo quando o `select` é literal
// inline, e aqui ele é montado a partir do FIELD_MAP.
const integRows = (integrations ?? []) as unknown as Row[];
const integByCompany = new Map(
  integRows.filter((i) => i.company_id).map((i) => [i.company_id as string, i]),
);

const divergencias: string[] = [];
const orfas: string[] = [];
let aplicadas = 0;
let camposCopiados = 0;

console.log(`${APPLY ? "APLICANDO" : "SIMULAÇÃO (nada será escrito)"} · ${mirror?.length ?? 0} linhas no n8n\n`);

for (const m of (mirror ?? []) as Row[]) {
  const companyId = m.helena_company_id as string;
  const integ = integByCompany.get(companyId);
  const nomeN8n = (m.nome as string) ?? "sem nome";

  if (!integ) {
    orfas.push(`${nomeN8n} (company ${companyId})`);
    continue;
  }

  const clinicId = integ.clinic_id as string;
  const nomeCc = nameById.get(clinicId) ?? "?";

  if (nomeN8n !== nomeCc) {
    divergencias.push(`NOME: n8n diz "${nomeN8n}", cadastro diz "${nomeCc}" (clinic ${clinicId})`);
  }
  if (m.panel_id && integ.panel_id && m.panel_id !== integ.panel_id) {
    divergencias.push(
      `PAINEL: ${nomeCc} — n8n usa ${m.panel_id}, o app usa ${integ.panel_id}. ` +
        `Resolver À MÃO: as métricas do app e a automação estão olhando painéis diferentes.`,
    );
  }

  // Copia só o que está vazio no clinic_control.
  const patch: Record<string, string | boolean> = {};
  for (const [from, to] of Object.entries(FIELD_MAP)) {
    const valor = m[from];
    if (valor && !integ[to]) {
      patch[to] = valor as string;
      camposCopiados += 1;
    }
  }
  // `ativo` do n8n é a verdade de hoje sobre quem está rodando.
  if (m.ativo === true && integ.automation_enabled !== true) patch.automation_enabled = true;

  const quantos = Object.keys(patch).length;
  if (quantos === 0) {
    console.log(`— ${nomeCc}: nada a copiar`);
    continue;
  }

  console.log(`+ ${nomeCc}: ${quantos} campo(s) → ${Object.keys(patch).join(", ")}`);
  if (APPLY) {
    const { error } = await cc.from("clinic_integrations").update(patch).eq("clinic_id", clinicId);
    if (error) {
      divergencias.push(`ERRO ao atualizar ${nomeCc}: ${error.message}`);
      continue;
    }
    aplicadas += 1;
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log(`Clínicas com campos a copiar: ${camposCopiados} campo(s)`);
if (APPLY) console.log(`Linhas atualizadas: ${aplicadas}`);

if (orfas.length > 0) {
  console.log(`\nÓRFÃS no n8n (sem clínica com esse company_id) — ${orfas.length}:`);
  for (const o of orfas) console.log(`  · ${o}`);
}

if (divergencias.length > 0) {
  console.log(`\nDIVERGÊNCIAS a decidir à mão — ${divergencias.length}:`);
  for (const d of divergencias) console.log(`  ! ${d}`);
} else {
  console.log("\nNenhuma divergência.");
}

console.log(
  APPLY
    ? "\nPronto. Rode a varredura em Configurações → Automação para completar o que faltar pela Helena."
    : "\nSimulação. Para gravar: npx tsx scripts/import-automacao-clinicas.mts --aplicar",
);
