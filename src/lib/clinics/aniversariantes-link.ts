import { createHmac } from "node:crypto";

// Assina os links de acesso ao app Aniversariantes.
//
// O app não tem login: quem entra, entra por link assinado, e o token carrega o
// slug da clínica — é isso que impede um acesso de ler dado de outra clínica.
// Ver Clinic-Control#74 e Aniversariantes/README.md § Acesso.
//
// ATENÇÃO — REGRA DUPLICADA EM DOIS REPOS. O verificador vive em
// `Aniversariantes/src/lib/clinica-token.ts` e precisa concordar byte a byte com
// o que sai daqui: formato do payload, ordem das chaves no JSON, base64url,
// HMAC-SHA256 sobre o payload JÁ codificado. Mudar um lado sem o outro não
// quebra build nenhum — quebra o acesso ao painel em runtime, para todas as
// clínicas de uma vez.
//
// É exatamente a armadilha que o ADR 0006 documentou (a constraint duplicada em
// SQL e TypeScript), agora numa terceira forma. A saída definitiva é a mesma: o
// dia em que o painel virar rota do Clinic Control, este arquivo e o verificador
// colapsam num só e o compilador passa a garantir o acordo. Enquanto forem dois,
// qualquer mudança aqui exige PR nos dois repos.
//
// Server-only: importa `node:crypto` e lê o segredo. Nunca importar no client.

/** Validade do link do botão "Abrir Aniversariantes" (equipe interna). */
const VALIDADE_BOTAO_SEGUNDOS = 10 * 60;

function secret(): string {
  const s = process.env.ANIVERSARIANTES_LINK_SECRET;
  if (!s) throw new Error("ANIVERSARIANTES_LINK_SECRET não configurada");
  return s;
}

/**
 * `expiresInSeconds: null` = link sem expiração, para colar na aba da Helena da
 * clínica. É credencial de longa duração: só rotacionar o segredo o invalida.
 */
function signClinicaToken(slug: string, expiresInSeconds: number | null): string {
  // A ordem das chaves aqui é parte do contrato — JSON.stringify preserva a
  // ordem de inserção, e o outro lado só faz JSON.parse, então na prática o que
  // importa é o conjunto de campos. Ainda assim: v, slug, exp, nesta ordem.
  const payload = {
    v: 1,
    slug,
    exp: expiresInSeconds === null ? null : Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

/** URL do painel para a equipe interna abrir agora. Expira em 10 minutos. */
export function aniversariantesPanelUrl(baseUrl: string, slug: string): string {
  const url = new URL("/", baseUrl);
  // `clinica` continua indo porque o ClinicaProvider do app o lê para escolher
  // a clínica inicial. Ele não decide mais nada de acesso — o `t` decide.
  url.searchParams.set("clinica", slug);
  url.searchParams.set("t", signClinicaToken(slug, VALIDADE_BOTAO_SEGUNDOS));
  return url.toString();
}

/** URL permanente para colar na configuração da aba da Helena daquela clínica. */
export function aniversariantesHelenaTabUrl(baseUrl: string, slug: string): string {
  const url = new URL("/", baseUrl);
  url.searchParams.set("clinica", slug);
  url.searchParams.set("t", signClinicaToken(slug, null));
  return url.toString();
}
