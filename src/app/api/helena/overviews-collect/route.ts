import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/crypto/token";
import { getContactCount, listChannels, getCompanyInfo } from "@/lib/helena/client";
import { mapPool } from "@/lib/utils/pool";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Mesmo teto de concorrência da home — o cron também não pode abrir rajada
// contra a Helena.
const POOL = 6;

/**
 * Gatilho do cron DIÁRIO que alimenta clinic_helena_overview (migration 0088).
 * Chamado pelo pg_cron via pg_net, autenticado por `x-cron-secret` — o mesmo
 * segredo das demais coletas, sem variável nova.
 *
 * Roda aqui e não numa Edge Function porque precisa DECIFRAR o token Helena de
 * cada clínica, e a chave (HELENA_TOKEN_ENC_KEY) vive no ambiente do app — o
 * mesmo motivo do /api/automacao/scan (migration 0071).
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
    .select("clinic_id, helena_token_encrypted, company_id")
    .not("helena_token_encrypted", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ ok: true, total: 0, updated: 0, failed: 0 });

  const targets = rows as Array<{
    clinic_id: string;
    helena_token_encrypted: string;
    company_id: string | null;
  }>;

  let updated = 0;
  let failed = 0;
  const results = await mapPool(targets, POOL, async (row) => {
    try {
      const token = decryptToken(row.helena_token_encrypted);
      const companyId = row.company_id ?? null;
      const [contactCount, channels, company] = await Promise.all([
        getContactCount(token).catch(() => 0),
        listChannels(token).catch(() => []),
        companyId ? getCompanyInfo(token, companyId).catch(() => null) : Promise.resolve(null),
      ]);
      const { error: upErr } = await supabase.from("clinic_helena_overview").upsert({
        clinic_id: row.clinic_id,
        contact_count: contactCount,
        company_status: company?.status ?? null,
        setup_status: company?.setupStatus ?? null,
        channels: channels ?? [],
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw new Error(upErr.message);
      return { ok: true as const };
    } catch (e) {
      console.error(
        `[overviews-collect] clínica ${row.clinic_id}:`,
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
