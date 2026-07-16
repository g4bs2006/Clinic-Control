// One-off (2026-07-16): recalcula os snapshots congelados de 2026-05 e 2026-06
// com o critério novo — janela mensal no fuso do Brasil (monthRangeBrt) +
// mapeamento dinâmico do funil da clínica. Além do fuso, os números mudam por
// maturação da coorte (cards que avançaram depois do congelamento) e pelo
// mapeamento agora valer também para o passado.
//
// Rodar da raiz do projeto: npx tsx scripts/recalc-snapshots-brt.mts
// (usa NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e
//  HELENA_TOKEN_ENC_KEY do .env.local)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "../src/lib/crypto/token";
import { getPanelWithSteps, listCards } from "../src/lib/helena/client";
import { buildLiveFunnel, type FunnelMapping, type SchedulerTagMapping } from "../src/lib/helena/funnel";
import { monthRangeBrt } from "../src/lib/snapshots/month";
import { resolveStatus } from "../src/lib/snapshots/status";

const MONTHS = ["2026-05", "2026-06"];
const CONCURRENCY = 3;

// ── .env.local → process.env (sem depender de dotenv) ───────────────────────
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "clinic_control" } },
);

// Mesma conversão de linha → mapping das actions (NULL nas duas colunas-chave
// = nunca configurada → fallback canônico por título).
function rowToMapping(row: Record<string, string[] | null>): FunnelMapping | null {
  const scheduled = row.scheduled_step_ids ?? null;
  const closing = row.closing_step_ids ?? null;
  if (scheduled === null && closing === null) return null;
  return {
    scheduledStepIds: scheduled ?? [],
    closingStepIds: closing ?? [],
    noshowStepIds: row.noshow_step_ids ?? [],
    notScheduledStepIds: row.notscheduled_step_ids ?? [],
    attendedStepIds: row.attended_step_ids ?? [],
    leadStepIds: row.lead_step_ids ?? [],
  };
}
function rowToTagMapping(row: Record<string, string[] | null>): SchedulerTagMapping | null {
  const crc = row.crc_tag_ids ?? null;
  const ia = row.ia_tag_ids ?? null;
  if (crc === null && ia === null) return null;
  return { crcTagIds: crc ?? [], iaTagIds: ia ?? [] };
}

const [{ data: integrations }, { data: clinics }, { data: rulesData }] = await Promise.all([
  supabase
    .from("clinic_integrations")
    .select(
      "clinic_id, helena_token_encrypted, panel_id, lead_step_ids, scheduled_step_ids, closing_step_ids, noshow_step_ids, notscheduled_step_ids, attended_step_ids, crc_tag_ids, ia_tag_ids",
    ),
  supabase.from("clinics").select("id, name, mode"),
  supabase.from("status_rules").select("label, rate_min, rate_max, color").order("position"),
]);

const rules = (rulesData ?? []) as { label: string; rate_min: number; rate_max: number; color: string }[];
const clinicById = new Map((clinics ?? []).map((c) => [c.id as string, c]));
const targets = (integrations ?? []).filter((i) => {
  const c = clinicById.get(i.clinic_id as string);
  return c?.mode === "auto" && i.panel_id && i.helena_token_encrypted;
});

console.log(`Clínicas auto com integração: ${targets.length} · meses: ${MONTHS.join(", ")}\n`);

let updated = 0;
let skipped = 0;
const errors: string[] = [];

async function recalcClinic(integ: (typeof targets)[number]) {
  const clinicId = integ.clinic_id as string;
  const name = (clinicById.get(clinicId)?.name as string) ?? clinicId;
  const token = decryptToken(integ.helena_token_encrypted as string);
  const panelId = integ.panel_id as string;
  const mapping = rowToMapping(integ as Record<string, string[] | null>);
  const tagMapping = rowToTagMapping(integ as Record<string, string[] | null>);

  for (const ym of MONTHS) {
    try {
      const { data: snap } = await supabase
        .from("monthly_snapshots")
        .select("leads, scheduled, rate, source")
        .eq("clinic_id", clinicId)
        .eq("year_month", ym)
        .maybeSingle();
      if (!snap) {
        skipped++;
        console.log(`  - ${name} ${ym}: sem snapshot, pulando`);
        continue;
      }
      if (snap.source !== "auto") {
        skipped++;
        console.log(`  - ${name} ${ym}: snapshot manual, preservado`);
        continue;
      }

      const { steps } = await getPanelWithSteps(token, panelId);
      const cards = await listCards(token, panelId, monthRangeBrt(ym));
      const f = buildLiveFunnel(steps, cards, mapping, tagMapping);
      const status = resolveStatus({ rate: f.rate, rules })?.label ?? null;

      const { error } = await supabase
        .from("monthly_snapshots")
        .update({
          leads: f.leads,
          scheduled: f.scheduled,
          rate: f.rate,
          revenue: f.revenue,
          step_counts: f.steps,
          no_show: f.noShow,
          attended: f.attended,
          closed: f.closed,
          not_scheduled: f.notScheduled,
          status,
        })
        .eq("clinic_id", clinicId)
        .eq("year_month", ym);
      if (error) throw new Error(error.message);

      const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
      console.log(
        `  ✓ ${name} ${ym}: leads ${snap.leads}→${f.leads} · agendados ${snap.scheduled}→${f.scheduled} · taxa ${pct(Number(snap.rate))}→${pct(f.rate)}`,
      );
      updated++;
    } catch (e) {
      errors.push(`${name} ${ym}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

for (let i = 0; i < targets.length; i += CONCURRENCY) {
  await Promise.all(targets.slice(i, i + CONCURRENCY).map(recalcClinic));
}

console.log(`\nAtualizados: ${updated} · pulados: ${skipped} · erros: ${errors.length}`);
for (const e of errors) console.log(`  ✗ ${e}`);
