import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createHmac, timingSafeEqual } from "node:crypto"

// Teste de contrato do token de acesso ao app Aniversariantes (#74).
//
// O QUE ELE PROTEGE. O assinador vive aqui
// (src/lib/clinics/aniversariantes-link.ts) e o verificador vive no OUTRO repo
// (Aniversariantes/src/lib/clinica-token.ts). Nenhum compilador garante que os
// dois concordam — mudar o formato aqui não quebra build nenhum, quebra o
// acesso ao painel em runtime, para todas as clínicas de uma vez. É a mesma
// armadilha do ADR 0006 (regra duplicada em dois lugares), numa terceira forma.
//
// O QUE ELE NÃO PROTEGE, e vale dizer explícito: se alguém mudar o VERIFICADOR
// no outro repo, nada aqui acusa. O teste fixa o formato do lado que produz, que
// é o lado que na prática muda (o verificador tem 30 linhas e ninguém mexe).
// A solução real é os dois colapsarem num só quando o painel virar rota do
// Clinic Control — aí o compilador assume o trabalho.

const SEGREDO = "segredo-de-teste-nao-usar-em-producao"

// Cópia deliberada do verificador do repo Aniversariantes. Se você mudar o
// assinador e este teste passar, é porque atualizou as duas cópias — que é
// exatamente o que a mudança real também exige.
function verificarComoOOutroRepoFaz(token: string, segredo: string) {
  const parte = token.split(".")
  if (parte.length !== 2) return null
  const [encoded, assinatura] = parte

  const esperada = Buffer.from(createHmac("sha256", segredo).update(encoded).digest("base64url"), "utf8")
  const recebida = Buffer.from(assinatura, "utf8")
  if (esperada.length !== recebida.length) return null
  if (!timingSafeEqual(esperada, recebida)) return null

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  if (payload?.v !== 1 || typeof payload.slug !== "string" || !payload.slug) return null
  if (payload.exp !== null && (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000)) {
    return null
  }
  return payload
}

describe("token de acesso ao Aniversariantes", () => {
  beforeEach(() => {
    process.env.ANIVERSARIANTES_LINK_SECRET = SEGREDO
    // Congela o tempo: `exp` entra no payload, então sem isso o vetor dourado
    // mudaria a cada execução.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.ANIVERSARIANTES_LINK_SECRET
  })

  it("o link permanente verifica no outro repo e não expira", async () => {
    const { aniversariantesHelenaTabUrl } = await import("@/lib/clinics/aniversariantes-link")
    const url = new URL(aniversariantesHelenaTabUrl("https://exemplo.app", "acme-slug"))

    const payload = verificarComoOOutroRepoFaz(url.searchParams.get("t")!, SEGREDO)
    expect(payload).toEqual({ v: 1, slug: "acme-slug", exp: null })

    // O slug também vai em `?clinica=` porque o ClinicaProvider do app o lê para
    // escolher a clínica inicial — mas ele não decide acesso.
    expect(url.searchParams.get("clinica")).toBe("acme-slug")
  })

  it("o link do botão expira em 10 minutos", async () => {
    const { aniversariantesPanelUrl } = await import("@/lib/clinics/aniversariantes-link")
    const token = new URL(aniversariantesPanelUrl("https://exemplo.app", "acme-slug"))
      .searchParams.get("t")!

    expect(verificarComoOOutroRepoFaz(token, SEGREDO)).toEqual({
      v: 1,
      slug: "acme-slug",
      exp: Math.floor(new Date("2026-08-21T12:10:00.000Z").getTime() / 1000),
    })

    // 1 segundo depois de expirar, o outro repo recusa.
    vi.setSystemTime(new Date("2026-08-21T12:10:01.000Z"))
    expect(verificarComoOOutroRepoFaz(token, SEGREDO)).toBeNull()
  })

  it("token assinado com outro segredo é recusado", async () => {
    const { aniversariantesHelenaTabUrl } = await import("@/lib/clinics/aniversariantes-link")
    const token = new URL(aniversariantesHelenaTabUrl("https://exemplo.app", "acme-slug"))
      .searchParams.get("t")!

    expect(verificarComoOOutroRepoFaz(token, "outro-segredo")).toBeNull()
  })

  it("trocar o slug no payload invalida a assinatura", async () => {
    // É o ataque que o token existe para impedir: pegar o link da própria
    // clínica e reescrever o slug para o de outra.
    const { aniversariantesHelenaTabUrl } = await import("@/lib/clinics/aniversariantes-link")
    const token = new URL(aniversariantesHelenaTabUrl("https://exemplo.app", "acme-slug"))
      .searchParams.get("t")!

    const [, assinatura] = token.split(".")
    const forjado = Buffer.from(JSON.stringify({ v: 1, slug: "outra-clinica", exp: null }))
      .toString("base64url")

    expect(verificarComoOOutroRepoFaz(`${forjado}.${assinatura}`, SEGREDO)).toBeNull()
  })

  it("falha fechado quando o segredo não está configurado", async () => {
    delete process.env.ANIVERSARIANTES_LINK_SECRET
    const { aniversariantesPanelUrl } = await import("@/lib/clinics/aniversariantes-link")

    // Lançar é o comportamento correto: sem segredo não há como distinguir
    // token válido de forjado, e o modo de falha certo é ninguém entrar.
    expect(() => aniversariantesPanelUrl("https://exemplo.app", "acme-slug")).toThrow(
      /ANIVERSARIANTES_LINK_SECRET/,
    )
  })
})
