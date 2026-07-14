// Gestores de tráfego da OdontoImpact — responsáveis pelo tráfego pago das
// clínicas que têm essa assinatura. Não são usuários do sistema (sem login).
// Mantido em código porque a lista muda raramente; para adicionar um gestor
// novo, inclua aqui.

export const TRAFFIC_MANAGERS = [
  "Filipe e Rani",
  "Ranielle",
  "João Lucas",
  "Rodrigo",
] as const;

export type TrafficManager = (typeof TRAFFIC_MANAGERS)[number];
