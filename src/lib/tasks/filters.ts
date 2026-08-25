// Filtros da lista de tarefas — lógica pura (sem React, sem I/O), como
// `agenda.ts`. O recorte roda no cliente sobre a lista já carregada, junto com
// os toggles "Mostrar concluídas"/"Adiadas", então tudo aqui é comparação de
// strings ISO e igualdade simples: dá para testar sem banco.

import type { TaskRow, TaskScope } from "./actions";
import type { TaskStatus } from "./categories";

export const ALL = "__all__";
/** Valor do "sem clínica" / "sem responsável" nos selects de filtro. */
export const NONE = "__none__";

export type DueFilter = "all" | "overdue" | "today" | "week" | "none";
export type SourceFilter = "all" | "ia" | "manual";
export type MarkerFilter = "all" | "recorrente" | "foco";

export type ListFilters = {
  /** Busca livre: título, clínica ou responsável. Não é persistida. */
  query: string;
  status: string;
  category: string;
  priority: string;
  /** id da clínica, `NONE` (tarefa interna) ou `ALL`. */
  clinic: string;
  /** id do responsável, `NONE` (sem responsável) ou `ALL`. */
  assignee: string;
  due: DueFilter;
  source: SourceFilter;
  marker: MarkerFilter;
};

export const DEFAULT_LIST_FILTERS: ListFilters = {
  query: "",
  status: ALL,
  category: ALL,
  priority: ALL,
  clinic: ALL,
  assignee: ALL,
  due: "all",
  source: "all",
  marker: "all",
};

export const DUE_LABEL: Record<DueFilter, string> = {
  all: "Qualquer prazo",
  overdue: "Atrasadas",
  today: "Vencem hoje",
  week: "Até o fim da semana",
  none: "Sem prazo",
};

export const SOURCE_LABEL: Record<SourceFilter, string> = {
  all: "Qualquer origem",
  ia: "Criadas pela IA",
  manual: "Criadas à mão",
};

export const MARKER_LABEL: Record<MarkerFilter, string> = {
  all: "Qualquer tipo",
  recorrente: "Recorrentes",
  foco: "Em foco",
};

/** Campos de uma tarefa que os filtros olham (mantém os testes leves). */
export type FilterableTask = Pick<
  TaskRow,
  | "title"
  | "status"
  | "category"
  | "priority"
  | "clinic_id"
  | "clinic_name"
  | "assignees"
  | "due_date"
  | "source"
  | "recurrence_id"
  | "pinned_at"
>;

const DONE_STATUSES = new Set<TaskStatus>(["concluida", "cancelada"]);

/** Quantos filtros estão fora do padrão — alimenta o "Filtros (N)". */
export function activeFilterCount(f: ListFilters): number {
  return (Object.keys(DEFAULT_LIST_FILTERS) as (keyof ListFilters)[]).filter((k) =>
    k === "query" ? f.query.trim() !== "" : f[k] !== DEFAULT_LIST_FILTERS[k],
  ).length;
}

/** Busca livre, sem acento-insensibilidade: título + clínica + responsáveis. */
export function matchesQuery(t: FilterableTask, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [t.title, t.clinic_name, ...t.assignees.map((a) => a.name)]
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(q));
}

/**
 * Recorte por prazo. "Atrasadas"/"Vencem hoje"/"Até o fim da semana" só valem
 * para tarefa em aberto — concluída/cancelada não está atrasada, mesmo com o
 * "Mostrar concluídas" ligado. Datas em YYYY-MM-DD (comparação lexicográfica).
 */
export function matchesDue(
  t: Pick<FilterableTask, "due_date" | "status">,
  filter: DueFilter,
  today: string,
  endOfWeek: string,
): boolean {
  if (filter === "all") return true;
  if (filter === "none") return t.due_date == null;
  if (t.due_date == null || DONE_STATUSES.has(t.status)) return false;
  if (filter === "overdue") return t.due_date < today;
  if (filter === "today") return t.due_date === today;
  return t.due_date <= endOfWeek; // "week": tudo que vence até domingo (inclui atrasadas)
}

/** Aplica todos os filtros de uma vez. */
export function matchesFilters(
  t: FilterableTask,
  f: ListFilters,
  today: string,
  endOfWeek: string,
): boolean {
  if (!matchesQuery(t, f.query)) return false;
  if (f.status !== ALL && t.status !== f.status) return false;
  if (f.category !== ALL && t.category !== f.category) return false;
  if (f.priority !== ALL && t.priority !== f.priority) return false;
  if (f.clinic !== ALL) {
    if (f.clinic === NONE ? t.clinic_id != null : t.clinic_id !== f.clinic) return false;
  }
  if (f.assignee !== ALL) {
    const has = t.assignees.some((a) => a.id === f.assignee);
    if (f.assignee === NONE ? t.assignees.length > 0 : !has) return false;
  }
  if (!matchesDue(t, f.due, today, endOfWeek)) return false;
  if (f.source !== "all" && t.source !== f.source) return false;
  if (f.marker === "recorrente" && t.recurrence_id == null) return false;
  if (f.marker === "foco" && t.pinned_at == null) return false;
  return true;
}

const DUE_VALUES: DueFilter[] = ["all", "overdue", "today", "week", "none"];
const SOURCE_VALUES: SourceFilter[] = ["all", "ia", "manual"];
const MARKER_VALUES: MarkerFilter[] = ["all", "recorrente", "foco"];

/**
 * Ajusta filtros herdados do localStorage para o escopo da rota (ADR 0009).
 * Em "internas" o recorte de clínica é fixo (só existe o NONE); em "clínicas"
 * um valor salvo de NONE (de uma visita anterior a /tarefas/internas) deixaria
 * a lista vazia sem explicação, então volta para ALL. Pura, com teste.
 */
export function sanitizeFiltersForScope(f: ListFilters, scope: TaskScope): ListFilters {
  if (scope === "internas") return f.clinic === NONE ? f : { ...f, clinic: NONE };
  if (scope === "clinicas" && f.clinic === NONE) return { ...f, clinic: ALL };
  return f;
}

/**
 * Lê os filtros guardados no localStorage, ignorando lixo (JSON inválido, chave
 * desconhecida, enum fora da lista) — um valor podre não pode deixar a lista
 * vazia sem explicação. A busca nunca é restaurada: filtro de texto velho ao
 * voltar na página parece bug.
 */
export function parseStoredFilters(raw: string | null): ListFilters {
  if (!raw) return DEFAULT_LIST_FILTERS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_LIST_FILTERS;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_LIST_FILTERS;
  const o = parsed as Record<string, unknown>;
  const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
  const oneOf = <T extends string>(v: unknown, values: T[], fallback: T): T =>
    values.includes(v as T) ? (v as T) : fallback;
  return {
    query: "",
    status: str(o.status, ALL),
    category: str(o.category, ALL),
    priority: str(o.priority, ALL),
    clinic: str(o.clinic, ALL),
    assignee: str(o.assignee, ALL),
    due: oneOf(o.due, DUE_VALUES, "all"),
    source: oneOf(o.source, SOURCE_VALUES, "all"),
    marker: oneOf(o.marker, MARKER_VALUES, "all"),
  };
}
