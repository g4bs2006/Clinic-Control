import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/form-credentials
// Recebe dados do formulário (Google Apps Script / n8n) e grava no banco.
// Protegido por um secret no header `x-webhook-secret`.
// Usa service_role para evitar dependência de sessão/cookies.

function deriveAgendaCode(link: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim().replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash === -1) return null;
  const code = trimmed.slice(lastSlash + 1);
  return code || null;
}

export async function POST(request: NextRequest) {
  // Validate webhook secret
  const secret = process.env.FORM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "FORM_WEBHOOK_SECRET não configurado no servidor" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("x-webhook-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const formName = (payload.form_name as string)?.trim();
  const token = (payload.token as string)?.trim();

  if (!formName || !token) {
    return NextResponse.json(
      { error: "Campos obrigatórios: form_name, token" },
      { status: 400 },
    );
  }

  const email = (payload.email as string)?.trim() || null;
  const apiUser = (payload.api_user as string)?.trim() || null;
  const agendaLink = (payload.agenda_link as string)?.trim() || null;
  const agendaCode = deriveAgendaCode(agendaLink);
  const submittedAt = (payload.submitted_at as string) || null;

  // Use service_role (webhook não tem sessão de usuário)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Upsert: idempotente por token
  const { data: existing } = await supabase
    .from("form_credentials")
    .select("id")
    .eq("token", token)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("form_credentials")
      .update({
        form_name: formName,
        email,
        api_user: apiUser,
        agenda_link: agendaLink,
        agenda_code: agendaCode,
        submitted_at: submittedAt,
      })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { action: "updated", id: existing.id },
      { status: 200 },
    );
  }

  const { data: inserted, error } = await supabase
    .from("form_credentials")
    .insert({
      form_name: formName,
      email,
      token,
      api_user: apiUser,
      agenda_link: agendaLink,
      agenda_code: agendaCode,
      submitted_at: submittedAt,
      clinic_id: null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { action: "created", id: inserted.id },
    { status: 201 },
  );
}
