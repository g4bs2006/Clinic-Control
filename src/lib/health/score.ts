// Health score da clínica — composição PURA (sem I/O) de sinais que já existem
// no sistema. Ciente de disponibilidade: cada clínica é pontuada só nos sinais
// presentes, com peso renormalizado + indicador de confiança (cobertura). Sinal
// ausente é EXCLUÍDO (não vira 0). Ver README/decisão "A + piso de confiança".
//
// Os inputs são montados por uma camada de dados separada (snapshots mensais,
// resumos diários, tarefas/acompanhamentos, tempo de resposta) — aqui só entra
// a matemática, para ser testável e determinística.

export type HealthComponentKey =
  | "conversao"
  | "sentimento"
  | "pendencias"
  | "tendencia"
  | "resposta";

export const HEALTH_WEIGHTS: Record<HealthComponentKey, number> = {
  conversao: 30,
  sentimento: 25,
  pendencias: 20,
  tendencia: 13,
  resposta: 12,
};

export const HEALTH_LABEL: Record<HealthComponentKey, string> = {
  conversao: "Conversão",
  sentimento: "Sentimento (7d)",
  pendencias: "Pendências",
  tendencia: "Tendência",
  resposta: "Tempo de resposta",
};

/** Frase curta do "porquê" quando um componente está puxando o score pra baixo. */
export const HEALTH_HINT: Record<HealthComponentKey, string> = {
  conversao: "Conversão baixa",
  sentimento: "Sinais negativos no WhatsApp",
  pendencias: "Pendências acumuladas",
  tendencia: "Taxa em queda",
  resposta: "Resposta lenta",
};

export type HealthSignals = {
  /** Índice da faixa de status em que a taxa atual cai (0 = pior) e nº de faixas. */
  bandIndex: number | null;
  bandCount: number;
  /** Resumos diários dos últimos 7 dias (vazio = sem sinal recente). */
  summaries7d: { severity: "baixa" | "media" | "alta"; churn: boolean }[];
  /** Pendências em aberto. */
  overdueTasks: number;
  highPriorityTasks: number; // alta/urgente, não atrasadas
  highSeverityAcomp: number; // acompanhamentos abertos severidade alta
  /** Taxa do mês atual e anterior (fração 0..1) para a tendência. */
  rate: number | null;
  ratePrev: number | null;
  /** Mediana de resposta humana no WhatsApp (minutos), ou null se sem grupo/dados. */
  responseMedianMin: number | null;
};

export type HealthBand = "saudavel" | "atencao" | "risco";
export type HealthConfidence = "alta" | "media" | "baixa";

export type HealthFactor = {
  key: HealthComponentKey;
  label: string;
  score: number; // 0..100
  weight: number;
  drag: number; // peso * (100 - score) — quanto puxa o score pra baixo
};

export type HealthResult =
  | {
      status: "insuficiente";
      score: null;
      band: null;
      confidence: null;
      coverage: number;
      factors: HealthFactor[];
    }
  | {
      status: "scored";
      score: number; // 0..100
      band: HealthBand;
      confidence: HealthConfidence;
      coverage: number; // 0..1
      factors: HealthFactor[]; // presentes, ordenados por maior drag
    };

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ── Componentes (retornam null quando o sinal não está presente) ─────────────

function conversaoScore(s: HealthSignals): number | null {
  if (s.bandIndex === null) return null;
  if (s.bandCount <= 1) return 100; // faixa única → considera ok
  return clamp((100 * s.bandIndex) / (s.bandCount - 1));
}

function sentimentoScore(s: HealthSignals): number | null {
  if (s.summaries7d.length === 0) return null;
  let penalty = 0;
  for (const d of s.summaries7d) {
    if (d.severity === "alta") penalty += 35;
    else if (d.severity === "media") penalty += 12;
    if (d.churn) penalty += 40;
  }
  return clamp(100 - Math.min(80, penalty));
}

function pendenciasScore(s: HealthSignals): number {
  const penalty =
    s.overdueTasks * 15 + s.highPriorityTasks * 8 + s.highSeverityAcomp * 10;
  return clamp(100 - penalty);
}

function tendenciaScore(s: HealthSignals): number | null {
  if (s.rate === null || s.ratePrev === null) return null;
  const deltaPts = (s.rate - s.ratePrev) * 100; // pontos percentuais
  return clamp(50 + deltaPts * 5);
}

function respostaScore(s: HealthSignals): number | null {
  if (s.responseMedianMin === null) return null;
  const m = s.responseMedianMin;
  if (m <= 15) return 100;
  if (m >= 120) return 0;
  return clamp((100 * (120 - m)) / (120 - 15));
}

// ── Composição ───────────────────────────────────────────────────────────────

function bandOf(score: number): HealthBand {
  if (score >= 70) return "saudavel";
  if (score >= 40) return "atencao";
  return "risco";
}

function confidenceOf(coverage: number): HealthConfidence {
  if (coverage >= 0.7) return "alta";
  if (coverage >= 0.4) return "media";
  return "baixa";
}

export function computeHealth(s: HealthSignals): HealthResult {
  const raw: Record<HealthComponentKey, number | null> = {
    conversao: conversaoScore(s),
    sentimento: sentimentoScore(s),
    pendencias: pendenciasScore(s),
    tendencia: tendenciaScore(s),
    resposta: respostaScore(s),
  };

  const present = (Object.keys(raw) as HealthComponentKey[])
    .filter((k) => raw[k] !== null)
    .map((k) => ({
      key: k,
      label: HEALTH_LABEL[k],
      score: raw[k] as number,
      weight: HEALTH_WEIGHTS[k],
      drag: HEALTH_WEIGHTS[k] * (100 - (raw[k] as number)),
    }));

  const totalWeight = Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);
  const presentWeight = present.reduce((a, f) => a + f.weight, 0);
  const coverage = presentWeight / totalWeight;

  const factors = [...present].sort((a, b) => b.drag - a.drag);

  // Piso: sem taxa (só pendências presente, ~20% de cobertura) não finge saúde.
  const hasConversao = raw.conversao !== null;
  if (!hasConversao || coverage < 0.35) {
    return { status: "insuficiente", score: null, band: null, confidence: null, coverage, factors };
  }

  const score = Math.round(
    present.reduce((acc, f) => acc + f.weight * f.score, 0) / presentWeight,
  );

  return {
    status: "scored",
    score,
    band: bandOf(score),
    confidence: confidenceOf(coverage),
    coverage,
    factors,
  };
}
