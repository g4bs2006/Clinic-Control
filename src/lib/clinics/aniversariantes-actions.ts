"use server";

// Ponte entre o Clinic Control e o app Aniversariantes (projeto Next.js
// separado, mesmo Supabase, schema `public` — ver Aniversariantes/README.md).
// O Clinic Control não gerencia o dia a dia (templates, agendamentos — isso
// continua só dentro do próprio Aniversariantes), só o "setup": criar/atualizar
// a linha em `public.aniversariantes_clinicas` reaproveitando o que já temos
// cadastrado aqui, pra não digitar credencial em dois lugares.
//
// Tipos e o helper de mapeamento de sistema ficam em aniversariantes-types.ts
// (um módulo "use server" só pode exportar funções async — ver comentário lá).
//
// Mapeamento (acordado em 2026-08-12, não é auto-descobrível pelo schema):
//   - slug do Aniversariantes = clinic_integrations.company_id (id da conta
//     na Helena) — não existe (nem deve existir) um slug próprio no cadastro
//     de clínicas do Clinic Control.
//   - clinicorp_subscriber_id = form_credentials.api_user (o campo genérico
//     "Usuário API" do formulário é, na prática, onde o subscriber_id da
//     Clinicorp é anotado — não o usuário de Basic Auth).
//   - clinicorp_usuario_api (usuário de Basic Auth de verdade) não tem fonte
//     no Clinic Control hoje — sempre manual aqui.
//   - eclinica_token não tem fonte no Clinic Control (o painel de credenciais
//     do formulário só existe para Google Agenda/Clinicorp) — sempre manual.
//   - helena_token vem de clinic_integrations.helena_token_encrypted,
//     decifrado com a mesma HELENA_TOKEN_ENC_KEY que o resto do app já usa.
//   - helena_from (sugestão, não obrigatório) vem de helena_accounts.phone.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { createAniversariantesServiceClient } from "@/lib/supabase/aniversariantes-service";
import { decryptToken } from "@/lib/crypto/token";
import { getSessionUser } from "@/lib/auth/session";
import { listFormCredentials } from "./form-credentials-actions";
import { aniversariantesHelenaTabUrl, aniversariantesPanelUrl } from "./aniversariantes-link";
import { mapClinicSystemToProntuario, type AniversariantesClinica, type AniversariantesSetup, type ProvisionAniversariantesInput } from "./aniversariantes-types";

/**
 * Lê o que já existe pra sugerir no formulário de provisionamento + o status
 * atual (já provisionada? com quais dados básicos?). Não escreve nada.
 */
export async function getAniversariantesSetup(
  clinicId: string,
  clinicSystem: string | null,
): Promise<AniversariantesSetup> {
  try {
    const sistemaProntuario = mapClinicSystemToProntuario(clinicSystem);

    const cc = createServiceClient();
    const [{ data: integ }, { data: account }] = await Promise.all([
      cc
        .from("clinic_integrations")
        .select("company_id, helena_token_encrypted")
        .eq("clinic_id", clinicId)
        .maybeSingle(),
      cc.from("helena_accounts").select("phone").eq("clinic_id", clinicId).maybeSingle(),
    ]);

    const companyId = (integ?.company_id as string | null) ?? null;

    let helenaToken: string | null = null;
    if (integ?.helena_token_encrypted) {
      try {
        helenaToken = decryptToken(integ.helena_token_encrypted as string);
      } catch {
        helenaToken = null; // key/payload não bateu — segue sem sugestão, não derruba o painel
      }
    }

    let clinicorpTokenApi: string | null = null;
    let clinicorpSubscriberId: string | null = null;
    let formCredentialLabel: string | null = null;
    if (sistemaProntuario === "clinicorp") {
      const creds = await listFormCredentials(clinicId);
      const cred = creds[0] ?? null; // mais recente (listFormCredentials ordena por submitted_at desc)
      if (cred) {
        clinicorpTokenApi = cred.token || null;
        clinicorpSubscriberId = cred.api_user || null;
        formCredentialLabel = cred.form_name;
      }
    }

    let clinica: AniversariantesClinica | null = null;
    if (companyId) {
      const av = createAniversariantesServiceClient();
      const { data } = await av
        .from("aniversariantes_clinicas")
        .select("id, slug, nome, sistema_prontuario, helena_from, clinicorp_usuario_api, created_at")
        .eq("slug", companyId)
        .maybeSingle();
      clinica = (data as AniversariantesClinica | null) ?? null;
    }

    return {
      ok: true,
      supported: sistemaProntuario !== null,
      sistemaProntuario,
      clinica,
      suggestion: {
        companyId,
        helenaToken,
        helenaFrom: (account?.phone as string | null) ?? null,
        clinicorpTokenApi,
        clinicorpSubscriberId,
        formCredentialLabel,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao carregar setup do Aniversariantes",
    };
  }
}

/**
 * Cria ou atualiza a linha da clínica em `public.aniversariantes_clinicas`
 * (upsert por slug = company_id). Único ponto de escrita cruzando pro schema
 * do Aniversariantes — tudo o mais (templates, histórico de envio) continua
 * só lá.
 */
export async function provisionAniversariantes(
  clinicId: string,
  clinicName: string,
  input: ProvisionAniversariantesInput,
) {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };

  const cc = createServiceClient();
  const { data: integ } = await cc
    .from("clinic_integrations")
    .select("company_id")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const companyId = integ?.company_id as string | undefined;
  if (!companyId) {
    return {
      ok: false as const,
      error:
        "Clínica sem conta Helena integrada (company_id ausente em clinic_integrations) — é o slug que o Aniversariantes usa, não dá pra provisionar sem isso.",
    };
  }

  const helenaToken = input.helenaToken?.trim();
  if (!helenaToken) return { ok: false as const, error: "Token da Helena é obrigatório" };

  const payload: Record<string, unknown> = {
    slug: companyId,
    nome: clinicName,
    sistema_prontuario: input.sistemaProntuario,
    helena_token: helenaToken,
    helena_from: input.helenaFrom?.trim() || null,
  };

  if (input.sistemaProntuario === "eclinica") {
    const eclinicaToken = input.eclinicaToken?.trim();
    if (!eclinicaToken) return { ok: false as const, error: "Token da e-Clínica é obrigatório" };
    payload.eclinica_token = eclinicaToken;
  } else {
    const usuario = input.clinicorpUsuarioApi?.trim();
    const token = input.clinicorpTokenApi?.trim();
    const subscriber = input.clinicorpSubscriberId?.trim();
    if (!usuario || !token || !subscriber) {
      return {
        ok: false as const,
        error: "Usuário API, Token API e Subscriber ID da Clinicorp são obrigatórios",
      };
    }
    payload.clinicorp_usuario_api = usuario;
    payload.clinicorp_token_api = token;
    payload.clinicorp_subscriber_id = subscriber;
  }

  const av = createAniversariantesServiceClient();
  const { error } = await av
    .from("aniversariantes_clinicas")
    .upsert(payload, { onConflict: "slug" });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/clinicas/${clinicId}`);
  return { ok: true as const, slug: companyId };
}

// URL do app. Fica aqui, do lado servidor, em vez de no componente: o link só
// serve acompanhado de um token assinado, e montar os dois no mesmo lugar evita
// que alguém reconstrua a URL sem o token e ache que funciona.
const ANIVERSARIANTES_BASE_URL =
  process.env.ANIVERSARIANTES_BASE_URL ?? "https://aniversariantes-murex.vercel.app";

/**
 * Link de acesso ao painel, gerado SOB DEMANDA (no clique, não no render).
 *
 * Dois motivos para não devolver isso junto do `getAniversariantesSetup`:
 * o token do botão expira em 10 minutos e ficaria velho numa aba aberta, e o
 * link permanente é credencial — não deve ficar embutido no HTML de toda
 * renderização da aba Cadastro.
 *
 * `permanente: true` devolve o link SEM expiração, para colar na configuração da
 * aba da Helena da clínica. É credencial de longa duração: só a rotação de
 * `ANIVERSARIANTES_LINK_SECRET` a invalida. Ver Clinic-Control#74.
 */
export async function getAniversariantesLink(clinicId: string, permanente = false) {
  if (!(await getSessionUser())) return { ok: false as const, error: "Não autenticado" };

  const cc = createServiceClient();
  const { data: integ } = await cc
    .from("clinic_integrations")
    .select("company_id")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const slug = integ?.company_id as string | undefined;
  if (!slug) {
    return { ok: false as const, error: "Clínica sem company_id da Helena — não há como montar o link." };
  }

  try {
    const url = permanente
      ? aniversariantesHelenaTabUrl(ANIVERSARIANTES_BASE_URL, slug)
      : aniversariantesPanelUrl(ANIVERSARIANTES_BASE_URL, slug);
    return { ok: true as const, url };
  } catch (err) {
    // Segredo ausente cai aqui. Mensagem explícita porque o sintoma no app do
    // outro lado seria só "acesso não autorizado", sem pista da causa.
    return { ok: false as const, error: (err as Error).message };
  }
}
