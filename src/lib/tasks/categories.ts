// Prioridades canônicas de tarefas.
// Categorias deixaram de ser fixas em código — vêm de `task_categories` no banco,
// configuráveis em /configuracoes (ver src/lib/tasks/category-actions.ts).
export type TaskCategory = string;

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

export const TASK_STATUSES = ["pendente", "em_andamento", "em_aprovacao", "concluida", "cancelada"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  em_aprovacao: "Em aprovação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
