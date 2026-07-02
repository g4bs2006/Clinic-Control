import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/crypto/token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get("clinicId");
    if (!clinicId) {
      return NextResponse.json({ error: "Missing clinicId parameter" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clinic_integrations")
      .select("helena_token_encrypted")
      .eq("clinic_id", clinicId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Integration not found", details: error }, { status: 404 });
    }

    const token = decryptToken(data.helena_token_encrypted);
    const res = await fetch("https://api.wts.chat/chat/v1/channel", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Helena API returned HTTP ${res.status}` }, { status: 500 });
    }

    const json = await res.json();
    return NextResponse.json({
      clinicId,
      rawChannels: json
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
