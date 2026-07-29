// Tipos/labels de notificação — client-safe (sem "use server"), pra UI e actions
// importarem o mesmo vocabulário.

export const NOTIFICATION_TYPES = [
  "mention",
  "task_assigned",
  "task_comment",
  "task_due_soon",
  "task_overdue",
  "acompanhamento_assigned",
  // Varredura semanal da automação de agendamento achou config incompleta ou
  // incoerente com o mapeamento do funil. Vai só para gestores.
  "automation_warning",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationRow = {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  actor_name: string | null;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};
