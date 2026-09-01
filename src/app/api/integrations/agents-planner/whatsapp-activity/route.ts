import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clinicIdsOwnedBy, verifyApiToken } from "@/lib/tokens/verify";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Raw WhatsApp group activity for the Agents Planner integration (see
 * `../tasks/route.ts` for the auth model — per-user token, scoped strictly to
 * the token owner's own carteira via `clinicIdsOwnedBy`). Reads what
 * `collect-groups` has already collected instead of talking to the Evolution
 * API directly — that collection is capacity-constrained (~3.4s/group, 200s
 * Edge Function ceiling, see `supabase/functions/collect-groups/README.md`)
 * and duplicating it here would only add load against the same bottleneck.
 *
 * `?refresh=1` triggers the same fast, best-effort group *discovery* that
 * `syncWhatsappGroups()` (`src/lib/whatsapp/actions.ts`) uses — never the full
 * message collection, which is designed to run ~120s under cron and would not
 * fit this route's lifecycle. Discovery failure never blocks the read.
 */

const MIN_LOOKBACK_HOURS = 1;
const MAX_LOOKBACK_HOURS = 72;
const DEFAULT_LOOKBACK_HOURS = 24;
const MIN_LIMIT_PER_CLINIC = 1;
const MAX_LIMIT_PER_CLINIC = 100;
const DEFAULT_LIMIT_PER_CLINIC = 30;
const MESSAGE_ROW_CEILING = 2000;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

async function triggerDiscovery(): Promise<string | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.COLLECT_GROUPS_CRON_SECRET;
  if (!baseUrl || !secret) return "COLLECT_GROUPS_CRON_SECRET não configurado";
  try {
    const res = await fetch(`${baseUrl}/functions/v1/collect-groups?discoverOnly=1`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return data?.error ?? `Falha na descoberta de grupos (HTTP ${res.status})`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Falha ao contatar a função de coleta";
  }
}

type MessageRow = {
  group_jid: string;
  event_ts: string;
  push_name: string | null;
  from_me: boolean;
  text: string | null;
  whatsapp_groups:
    | { clinic_id: string | null; name: string | null; clinics: { name: string | null } | { name: string | null }[] | null }
    | { clinic_id: string | null; name: string | null; clinics: { name: string | null } | { name: string | null }[] | null }[]
    | null;
};

export async function GET(request: NextRequest) {
  const auth = await verifyApiToken(request.headers.get("x-agents-planner-secret"));
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const clinicIds = await clinicIdsOwnedBy(auth.userId);
  if (clinicIds.length === 0) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      refreshed: false,
      refreshError: null,
      lookbackHours: DEFAULT_LOOKBACK_HOURS,
      groups: [],
    });
  }

  const params = request.nextUrl.searchParams;
  const refresh = params.get("refresh") === "1" || params.get("refresh") === "true";
  const lookbackHours = clamp(
    Number(params.get("lookbackHours") ?? DEFAULT_LOOKBACK_HOURS),
    MIN_LOOKBACK_HOURS,
    MAX_LOOKBACK_HOURS,
  );
  const limitPerClinic = clamp(
    Number(params.get("limitPerClinic") ?? DEFAULT_LIMIT_PER_CLINIC),
    MIN_LIMIT_PER_CLINIC,
    MAX_LIMIT_PER_CLINIC,
  );

  const refreshError = refresh ? await triggerDiscovery() : null;

  const supabase = createServiceClient();
  const sinceIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("whatsapp_group_messages")
    .select("group_jid, event_ts, push_name, from_me, text, whatsapp_groups!inner(clinic_id, name, clinics(name))")
    .in("whatsapp_groups.clinic_id", clinicIds)
    .gte("event_ts", sinceIso)
    .order("event_ts", { ascending: false })
    .limit(MESSAGE_ROW_CEILING);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type GroupBucket = {
    clinicId: string;
    clinicName: string;
    groupJid: string;
    groupName: string | null;
    messages: { eventTs: string; pushName: string | null; fromMe: boolean; text: string | null }[];
  };
  const buckets = new Map<string, GroupBucket>();

  for (const raw of (data ?? []) as unknown as MessageRow[]) {
    const groupRel = Array.isArray(raw.whatsapp_groups) ? raw.whatsapp_groups[0] : raw.whatsapp_groups;
    const clinicId = groupRel?.clinic_id ?? null;
    if (!clinicId) continue;
    const clinicRel = groupRel?.clinics;
    const clinicRow = Array.isArray(clinicRel) ? clinicRel[0] : clinicRel;

    let bucket = buckets.get(raw.group_jid);
    if (!bucket) {
      bucket = {
        clinicId,
        clinicName: clinicRow?.name ?? "—",
        groupJid: raw.group_jid,
        groupName: groupRel?.name ?? null,
        messages: [],
      };
      buckets.set(raw.group_jid, bucket);
    }
    if (bucket.messages.length >= limitPerClinic) continue;
    bucket.messages.push({
      eventTs: raw.event_ts,
      pushName: raw.push_name,
      fromMe: raw.from_me,
      text: raw.text,
    });
  }

  const groups = Array.from(buckets.values())
    .filter((g) => g.messages.length > 0)
    .map((g) => ({ ...g, messages: g.messages.slice().reverse() }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    refreshed: refresh,
    refreshError,
    lookbackHours,
    groups,
  });
}
