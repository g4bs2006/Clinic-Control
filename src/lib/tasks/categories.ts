// Categorias e prioridades canônicas de tarefas.
export const TASK_CATEGORIES = [
  "atendimento",
  "financeiro",
  "suporte_tecnico",
  "onboarding",
  "contrato",
  "outro",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  atendimento: "Atendimento",
  financeiro: "Financeiro",
  suporte_tecnico: "Suporte técnico",
  onboarding: "Onboarding",
  contrato: "Contrato",
  outro: "Outro",
};

export const TASK_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};
/** Ordem para ordenação (maior primeiro). */
export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  urgente: 3,
  alta: 2,
  media: 1,
  baixa: 0,
};

export const TASK_ATTACHMENTS_BUCKET = "task-attachments";

export const TASK_STATUSES = ["pendente", "em_andamento", "concluida", "cancelada"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
