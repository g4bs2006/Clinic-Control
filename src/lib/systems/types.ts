// Tipos e derivação de estado dos sistemas por clínica — ADR 0007.
//
// Módulo PURO de propósito: sem "use server", sem I/O. Duas razões.
//
// 1. A matriz de /sistemas e a faixa de status na aba Cadastro têm que derivar
//    o estado pela MESMA função, senão divergem. O ADR 0007 registra essa
//    divergência como a consequência mais provável da decisão; centralizar a
//    regra aqui é o que a evita.
// 2. Sem isso não há como testar a derivação. E ela precisa de teste: o estado
//    depende da forma do dado em três schemas diferentes (`clinic_control`,
//    `aniversariantes`, `dashboards`) — se um deles mudar, a coluna mente em
//    silêncio, que é exatamente o modo de falha que /sistemas existe para matar.

export const SYSTEM_KEYS = ["automacao", "aniversariantes", "dashboard", "helena"] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];

/**
 * Estados de uma célula. A ordem aqui é a ordem de PRIORIDADE VISUAL, não
 * alfabética: `pronta` é o estado que pede ação e recebe o acento de marca;
 * `ok` recua. Ver ADR 0007 — maioria verde não informa nada, e um vazio
 * acionável não deve ser mais discreto que um sucesso.
 */
export type SystemState =
  /** Elegível, com todo pré-requisito pronto: um clique, nada a digitar. */
  | "pronta"
  /** Existe mas incompleto. É o estado que hoje não aparece em lugar nenhum. */
  | "parcial"
  /** Falta um pré-requisito NESTA clínica (tipicamente o company_id da Helena). */
  | "bloqueada"
  /** Configurado. */
  | "ok"
  /** Desligado — de propósito ou nunca ligado; a tela não sabe distinguir. */
  | "off"
  /** O sistema não suporta essa clínica. Sem isto, metade da coluna é ruído. */
  | "na";

export const SYSTEM_LABELS: Record<SystemKey, string> = {
  automacao: "Automação de agendamento",
  aniversariantes: "Aniversariantes",
  dashboard: "Dashboard de performance",
  helena: "Conta Helena",
};

export const STATE_LABELS: Record<SystemState, string> = {
  pronta: "pronta",
  parcial: "parcial",
  bloqueada: "bloqueada",
  ok: "configurado",
  off: "desligado",
  na: "—",
};

/** Estados que contam como pendência — o filtro "só com pendência" usa isto. */
export const PENDING_STATES: ReadonlySet<SystemState> = new Set<SystemState>([
  "pronta",
  "parcial",
  "bloqueada",
]);

export function isPending(state: SystemState): boolean {
  return PENDING_STATES.has(state);
}

/** Sistemas de prontuário que o app Aniversariantes integra hoje. */
const PRONTUARIOS_ANIVERSARIANTES = new Set(["Clinicorp", "e-Clínica"]);

/**
 * Fatos crus de uma clínica, colhidos pelas queries em actions.ts.
 *
 * INVARIANTES que o caller garante e o tipo não expressa — `companyId: null`
 * implica os três seguintes, porque o company_id é a chave de junção com os
 * outros schemas e sem ele não há o que procurar:
 *
 *   companyId === null  ⇒  automationMirrored === false
 *                      ⇒  aniversariantesProvisioned === false
 *                      ⇒  dashboardExists === false
 *
 * Escrito aqui porque duas versões do teste desta derivação já falharam por
 * montar combinações que o servidor não consegue produzir. Um tipo que as
 * proibisse seria melhor; até lá, isto é o contrato.
 */
export type SystemFacts = {
  /** Existe linha em `clinic_integrations` — ou seja, há integração Helena. */
  hasIntegrationRow: boolean;
  /** `clinic_integrations.company_id` — id da conta na Helena. Chave de tudo. */
  companyId: string | null;
  hasHelenaToken: boolean;
  /** `clinics.system` — qual prontuário a clínica usa. */
  prontuario: string | null;

  automationEnabled: boolean;
  /** Etapa de agendamento mapeada: sem ela a automação não tem o que fazer. */
  automationHasScheduledStep: boolean;
  /** Existe linha espelhada em `public.automacao_clinicas` (a que o n8n lê). */
  automationMirrored: boolean;

  aniversariantesProvisioned: boolean;
  /** `form_credentials` com token E api_user — o que dispensa digitação. */
  hasClinicorpCredential: boolean;

  dashboardExists: boolean;
  /** `dashboards.clinics.steps ? '_funnel'` — sem ele o funil não renderiza. */
  dashboardHasFunnel: boolean;
};

export function deriveHelena(f: SystemFacts): SystemState {
  return f.companyId && f.hasHelenaToken ? "ok" : "off";
}

export function deriveAutomacao(f: SystemFacts): SystemState {
  // Sem integração Helena a automação não se aplica. O teste é a EXISTÊNCIA da
  // linha, não o company_id — alinhado com listAutomationOverview(), que dá
  // `continue` quando não há linha. Em 2026-08-21 as duas regras davam o mesmo
  // resultado (nenhuma linha tem company_id nulo), mas manter a mesma da tela
  // que já existia evita que a matriz e o panorama discordem sobre a mesma
  // clínica se isso mudar.
  if (!f.hasIntegrationRow) return "na";
  if (!f.automationEnabled) return "off";
  // Ligada aqui mas sem espelho no n8n é o caso que ninguém enxergava: o app
  // acha que está automatizando e o workflow não conhece a clínica.
  if (!f.automationHasScheduledStep || !f.automationMirrored) return "parcial";
  return "ok";
}

export function deriveAniversariantes(f: SystemFacts): SystemState {
  // O único sistema com elegibilidade TÉCNICA: o app só integra com dois
  // prontuários. Marcar os outros como pendência tornaria metade da coluna
  // falso alarme — ver ADR 0007, alternativa recusada "três estados".
  if (!f.prontuario || !PRONTUARIOS_ANIVERSARIANTES.has(f.prontuario)) return "na";
  if (f.aniversariantesProvisioned) return "ok";
  // O slug em `aniversariantes_clinicas` É o company_id, e o token Helena é
  // obrigatório na tabela. Sem os dois não há como provisionar de forma alguma.
  if (!f.companyId || !f.hasHelenaToken) return "bloqueada";
  // Clinicorp exige três credenciais que vêm de `form_credentials`. Sem ela dá
  // para provisionar, mas alguém tem que ir buscar o dado — não é um clique.
  if (f.prontuario === "Clinicorp" && !f.hasClinicorpCredential) return "parcial";
  return "pronta";
}

export function deriveDashboard(f: SystemFacts): SystemState {
  // Sem "na": TODAS as clínicas terão dashboard (decidido em 2026-08-21), então
  // ausência é sempre pendência real. Foi o que dispensou um campo de "produtos
  // contratados" — ver ADR 0007, alternativa recusada.
  if (f.dashboardExists) return f.dashboardHasFunnel ? "ok" : "parcial";
  if (!f.companyId) return "bloqueada";
  return "pronta";
}

export function deriveAll(f: SystemFacts): Record<SystemKey, SystemState> {
  return {
    automacao: deriveAutomacao(f),
    aniversariantes: deriveAniversariantes(f),
    dashboard: deriveDashboard(f),
    helena: deriveHelena(f),
  };
}

export type SystemsRow = {
  clinicId: string;
  clinicName: string;
  prontuario: string | null;
  contractStatus: string;
  states: Record<SystemKey, SystemState>;
  /** Legenda curta na célula, quando o estado sozinho não explica. */
  hints: Partial<Record<SystemKey, string>>;
};

/** Contagem por coluna, para o cabeçalho e os cartões de resumo. */
export function tally(rows: SystemsRow[], key: SystemKey): Record<SystemState, number> {
  const t: Record<SystemState, number> = {
    pronta: 0, parcial: 0, bloqueada: 0, ok: 0, off: 0, na: 0,
  };
  for (const r of rows) t[r.states[key]]++;
  return t;
}
