// Motivos canônicos de churn — usados no select do registro e nos agregados.
export const CHURN_REASONS = [
  "Resultado abaixo do esperado",
  "Preço / financeiro",
  "Atendimento / relacionamento",
  "Trocou de fornecedor",
  "Clínica fechou / reestruturou",
  "Fim de contrato sem renovação",
  "Outro",
] as const;

export type ChurnReason = (typeof CHURN_REASONS)[number];
