import { describe, expect, it } from "vitest";
import {
  ALL,
  NONE,
  DEFAULT_LIST_FILTERS,
  sanitizeFiltersForScope,
  type ListFilters,
} from "@/lib/tasks/filters";

function filters(over: Partial<ListFilters> = {}): ListFilters {
  return { ...DEFAULT_LIST_FILTERS, ...over };
}

describe("sanitizeFiltersForScope (ADR 0009)", () => {
  it("mantém o filtro de clínica intacto em 'all'", () => {
    expect(sanitizeFiltersForScope(filters({ clinic: "clinic-1" }), "all")).toEqual(
      filters({ clinic: "clinic-1" }),
    );
    expect(sanitizeFiltersForScope(filters({ clinic: NONE }), "all")).toEqual(filters({ clinic: NONE }));
  });

  it("força NONE em 'internas' (o recorte de clínica é fixo)", () => {
    expect(sanitizeFiltersForScope(filters(), "internas").clinic).toBe(NONE);
    expect(sanitizeFiltersForScope(filters({ clinic: "clinic-1" }), "internas").clinic).toBe(NONE);
  });

  it("não recria o objeto em 'internas' quando já está em NONE", () => {
    const f = filters({ clinic: NONE });
    expect(sanitizeFiltersForScope(f, "internas")).toBe(f);
  });

  it("em 'clinicas', um NONE herdado do localStorage volta para ALL", () => {
    expect(sanitizeFiltersForScope(filters({ clinic: NONE }), "clinicas").clinic).toBe(ALL);
  });

  it("em 'clinicas', uma clínica específica é preservada", () => {
    expect(sanitizeFiltersForScope(filters({ clinic: "clinic-1" }), "clinicas").clinic).toBe("clinic-1");
  });

  it("preserva os demais filtros ao sanear", () => {
    const f = filters({ status: "pendente", assignee: "dev-1", due: "today" });
    const out = sanitizeFiltersForScope(f, "internas");
    expect(out.status).toBe("pendente");
    expect(out.assignee).toBe("dev-1");
    expect(out.due).toBe("today");
    expect(out.query).toBe("");
  });
});
