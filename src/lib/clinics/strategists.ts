// Estrategistas do ecossistema — não são usuários do sistema (sem login),
// mas cada clínica tem um estrategista responsável e devs/gestores precisam
// saber quem é. Mantido em código porque a lista muda raramente; para
// adicionar um estrategista novo, inclua aqui.

export const STRATEGISTS = [
  "Ana Paula e Guilherme Battistella",
  "Ana Paula",
  "Ana Flávia",
  "Schumacher",
  "Rodrigo",
  "Gui Ferreira",
  "Thalia",
  "Amanda",
] as const;

export type Strategist = (typeof STRATEGISTS)[number];
