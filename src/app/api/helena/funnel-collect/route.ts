import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchFunnelForMonth } from "@/lib/clinics/integration-actions";
import { monthKey } from "@/lib/snapshots/month";
import { mapPool } from "@/lib/utils/pool";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Mesmo teto de concorrência da home e do overviews-collect — o cron também
// não pode abrir rajada contra a Helena.
const POOL = 6;

/**
 * Gatilho do cron DIÁRIO que alimenta clinic_helena_funnel_current (migration
 * 0089). Chamado pelo pg_cron via pg_net, autenticado por `x-cron-secret` —
 * o mesmo segredo das demais coletas, sem variável nova.
 *
 * Só clínicas com painel vinculado entram (sem painel, fetchFunnelForMonth
 * sempre devolve ok:false — nem vale a chamada).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "COLLECT_GROUPS_CRON_SECRET não configurado" },
      { status: 500 },
    );
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("clinic_integrations")
    .select("clinic_id")
    .not("helena_token_encrypted", "is", null)
    .not("panel_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ ok: true, total: 0, updated: 0, failed: 0 });

  const targets = rows as Array<{ clinic_id: string }>;
  const yearMonth = monthKey(new Date());

  let updated = 0;
  let failed = 0;
  const results = await mapPool(targets, POOL, async (row) => {
    try {
      const r = await fetchFunnelForMonth(row.clinic_id, yearMonth);
      if (!r.ok) throw new Error(r.error);
      const { error: upErr } = await supabase.from("clinic_helena_funnel_current").upsert({
        clinic_id: row.clinic_id,
        year_month: yearMonth,
        leads: r.funnel.leads,
        scheduled: r.funnel.scheduled,
        rate: r.funnel.rate,
        revenue: r.funnel.revenue,
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw new Error(upErr.message);
      return { ok: true as const };
    } catch (e) {
      console.error(
        `[funnel-collect] clínica ${row.clinic_id}:`,
        e instanceof Error ? e.message : e,
      );
      return { ok: false as const, error: e instanceof Error ? e.message : "falha" };
    }
  });
  for (const r of results) {
    if (r.ok) updated += 1;
    else failed += 1;
  }

  return NextResponse.json({ ok: true, total: rows.length, updated, failed });
}
