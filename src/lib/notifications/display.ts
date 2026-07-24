// Lógica pura de apresentação de notificações — client-safe (sem "use server"/
// "server-only"), para o painel e testes importarem o mesmo vocabulário.
import {
  AtSign,
  UserPlus,
  MessageSquare,
  Clock,
  AlertTriangle,
  ClipboardList,
  Bell,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "./types";

export type NotificationVisual = { Icon: LucideIcon; colorClass: string };

const VISUALS: Record<NotificationType, NotificationVisual> = {
  mention: { Icon: AtSign, colorClass: "text-brand" },
  task_assigned: { Icon: UserPlus, colorClass: "text-indigo-400" },
  task_comment: { Icon: MessageSquare, colorClass: "text-slate-400" },
  task_due_soon: { Icon: Clock, colorClass: "text-amber-400" },
  task_overdue: { Icon: AlertTriangle, colorClass: "text-red-400" },
  acompanhamento_assigned: { Icon: ClipboardList, colorClass: "text-teal-400" },
};

/** Ícone + cor por tipo. Fallback neutro para tipo desconhecido (nunca quebra). */
export function notificationVisual(type: string): NotificationVisual {
  return VISUALS[type as NotificationType] ?? { Icon: Bell, colorClass: "text-muted-foreground" };
}

export type DayBucket = "hoje" | "ontem" | "semana" | "antes";

// Data-calendário de São Paulo no formato YYYY-MM-DD (en-CA => ISO-like).
function spDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Agrupa por proximidade no fuso America/Sao_Paulo. `now` é injetado p/ testes. */
export function dayBucket(createdAtIso: string, now: Date): DayBucket {
  // Compara as datas-calendário de SP como UTC-midnight (diferença em dias inteiros).
  const created = Date.parse(spDate(new Date(createdAtIso)));
  const today = Date.parse(spDate(now));
  const diffDays = Math.round((today - created) / 86_400_000);
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return "semana";
  return "antes";
}
