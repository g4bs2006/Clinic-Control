import { describe, expect, it } from "vitest";
import {
  ALL,
  DEFAULT_LIST_FILTERS,
  NONE,
  activeFilterCount,
  matchesDue,
  matchesFilters,
  matchesQuery,
  parseStoredFilters,
  type FilterableTask,
  type ListFilters,
} from "@/lib/tasks/filters";

const today = "2026-07-08"; // quarta
const endOfWeek = "2026-07-12"; // domingo

function task(over: Partial<FilterableTask> = {}): FilterableTask {
  return {
    title: "Cobrar relatório da clínica",
    status: "pendente",
    category: "operacional",
    priority: "media",
    clinic_id: "clinic-1",
    clinic_name: "Salutar",
    assignees: [{ id: "dev-1", name: "André" }],
    due_date: "2026-07-10",
    source: "manual",
    recurrence_id: null,
    pinned_at: null,
    ...over,
  };
}

function filters(over: Partial<ListFilters> = {}): ListFilters {
  return { ...DEFAULT_LIST_FILTERS, ...over };
}

describe("matchesQuery", () => {
  it("acha por título, clínica ou responsável, sem caixa", () => {
    expect(matchesQuery(task(), "RELATÓRIO")).toBe(true);
    expect(matchesQuery(task(), "salutar")).toBe(true);
    expect(matchesQuery(task(), "andré")).toBe(true);
    expect(matchesQuery(task(), "biosorriso")).toBe(false);
  });

  it("busca vazia (ou só espaços) não filtra nada", () => {
    expect(matchesQuery(task(), "")).toBe(true);
    expect(matchesQuery(task(), "   ")).toBe(true);
  });
});

describe("matchesDue", () => {
  it("classifica cada faixa", () => {
    const t = (due_date: string | null) => ({ due_date, status: "pendente" as const });
    expect(matchesDue(t("2026-07-07"), "overdue", today, endOfWeek)).toBe(true);
    expect(matchesDue(t("2026-07-08"), "overdue", today, endOfWeek)).toBe(false);
    expect(matchesDue(t("2026-07-08"), "today", today, endOfWeek)).toBe(true);
    expect(matchesDue(t("2026-07-12"), "week", today, endOfWeek)).toBe(true);
    expect(matchesDue(t("2026-07-13"), "week", today, endOfWeek)).toBe(false);
    expect(matchesDue(t(null), "none", today, endOfWeek)).toBe(true);
    expect(matchesDue(t("2026-07-10"), "none", today, endOfWeek)).toBe(false);
    expect(matchesDue(t(null), "all", today, endOfWeek)).toBe(true);
  });

  it("tarefa concluída/cancelada nunca conta como atrasada", () => {
    expect(matchesDue({ due_date: "2026-07-01", status: "concluida" }, "overdue", today, endOfWeek)).toBe(false);
    expect(matchesDue({ due_date: "2026-07-01", status: "cancelada" }, "overdue", today, endOfWeek)).toBe(false);
  });

  it("sem prazo continua achável pelo filtro 'sem prazo', mesmo concluída", () => {
    expect(matchesDue({ due_date: null, status: "concluida" }, "none", today, endOfWeek)).toBe(true);
  });
});

describe("matchesFilters", () => {
  it("padrão não filtra nada", () => {
    expect(matchesFilters(task(), filters(), today, endOfWeek)).toBe(true);
  });

  it("clínica e responsável casam por id", () => {
    expect(matchesFilters(task(), filters({ clinic: "clinic-1" }), today, endOfWeek)).toBe(true);
    expect(matchesFilters(task(), filters({ clinic: "clinic-2" }), today, endOfWeek)).toBe(false);
    expect(matchesFilters(task(), filters({ assignee: "dev-2" }), today, endOfWeek)).toBe(false);
  });

  it("NONE pega tarefa interna / sem responsável", () => {
    const interna = task({ clinic_id: null, clinic_name: null, assignees: [] });
    expect(matchesFilters(interna, filters({ clinic: NONE }), today, endOfWeek)).toBe(true);
    expect(matchesFilters(interna, filters({ assignee: NONE }), today, endOfWeek)).toBe(true);
    expect(matchesFilters(task(), filters({ clinic: NONE }), today, endOfWeek)).toBe(false);
    expect(matchesFilters(task(), filters({ assignee: NONE }), today, endOfWeek)).toBe(false);
  });

  it("tarefa com vários responsáveis casa o filtro se QUALQUER um bater", () => {
    const dupla = task({ assignees: [{ id: "dev-1", name: "André" }, { id: "dev-2", name: "Bia" }] });
    expect(matchesFilters(dupla, filters({ assignee: "dev-1" }), today, endOfWeek)).toBe(true);
    expect(matchesFilters(dupla, filters({ assignee: "dev-2" }), today, endOfWeek)).toBe(true);
    expect(matchesFilters(dupla, filters({ assignee: "dev-3" }), today, endOfWeek)).toBe(false);
    expect(matchesFilters(dupla, filters({ assignee: NONE }), today, endOfWeek)).toBe(false);
  });

  it("busca livre acha por qualquer um dos responsáveis", () => {
    const dupla = task({ assignees: [{ id: "dev-1", name: "André" }, { id: "dev-2", name: "Bia" }] });
    expect(matchesQuery(dupla, "bia")).toBe(true);
  });

  it("origem, recorrente e em foco", () => {
    expect(matchesFilters(task({ source: "ia" }), filters({ source: "ia" }), today, endOfWeek)).toBe(true);
    expect(matchesFilters(task(), filters({ source: "ia" }), today, endOfWeek)).toBe(false);
    expect(matchesFilters(task({ recurrence_id: "r1" }), filters({ marker: "recorrente" }), today, endOfWeek)).toBe(true);
    expect(matchesFilters(task(), filters({ marker: "recorrente" }), today, endOfWeek)).toBe(false);
    expect(
      matchesFilters(task({ pinned_at: "2026-07-30T12:00:00Z" }), filters({ marker: "foco" }), today, endOfWeek),
    ).toBe(true);
    expect(matchesFilters(task(), filters({ marker: "foco" }), today, endOfWeek)).toBe(false);
  });

  it("combina filtros (E, não OU)", () => {
    const f = filters({ clinic: "clinic-1", priority: "urgente" });
    expect(matchesFilters(task(), f, today, endOfWeek)).toBe(false);
    expect(matchesFilters(task({ priority: "urgente" }), f, today, endOfWeek)).toBe(true);
  });
});

describe("activeFilterCount", () => {
  it("conta só o que está fora do padrão", () => {
    expect(activeFilterCount(filters())).toBe(0);
    expect(activeFilterCount(filters({ query: "  " }))).toBe(0);
    expect(activeFilterCount(filters({ query: "salutar", clinic: "clinic-1", due: "overdue" }))).toBe(3);
  });
});

describe("parseStoredFilters", () => {
  it("restaura o que foi salvo, menos a busca", () => {
    const raw = JSON.stringify({ query: "salutar", clinic: "clinic-1", due: "overdue" });
    expect(parseStoredFilters(raw)).toEqual(filters({ clinic: "clinic-1", due: "overdue" }));
  });

  it("ignora lixo em vez de esvaziar a lista", () => {
    expect(parseStoredFilters(null)).toEqual(DEFAULT_LIST_FILTERS);
    expect(parseStoredFilters("{não é json")).toEqual(DEFAULT_LIST_FILTERS);
    expect(parseStoredFilters('"string solta"')).toEqual(DEFAULT_LIST_FILTERS);
    expect(parseStoredFilters(JSON.stringify({ due: "ontem", source: 42 }))).toEqual(DEFAULT_LIST_FILTERS);
    expect(parseStoredFilters(JSON.stringify({ status: "" }))).toEqual(filters({ status: ALL }));
  });
});
