import { describe, expect, it } from "vitest";
import { KANBAN_STATUSES, concludeTarget, needsApproval, statusOptions } from "@/lib/tasks/approval";
import { TASK_STATUSES } from "@/lib/tasks/categories";

describe("etapa de aprovação (ADR 0011)", () => {
  it("quem não é gestor precisa de aprovação; gestor não", () => {
    expect(needsApproval(false)).toBe(true);
    expect(needsApproval(true)).toBe(false);
  });

  it("o botão Concluir aponta pra revisão quando não é gestor", () => {
    expect(concludeTarget(false)).toBe("em_aprovacao");
    expect(concludeTarget(true)).toBe("concluida");
  });

  it("esconde 'Concluída' do select de quem não é gestor", () => {
    expect(statusOptions(false)).not.toContain("concluida");
    // "Em aprovação" fica disponível: desde o ADR 0011 vale pra tarefa de
    // clínica também, não só interna.
    expect(statusOptions(false)).toContain("em_aprovacao");
  });

  it("gestor vê todos os status", () => {
    expect(statusOptions(true)).toEqual([...TASK_STATUSES]);
  });

  it("o Kanban mostra só as colunas de trabalho aberto", () => {
    expect([...KANBAN_STATUSES]).toEqual(["pendente", "em_andamento", "em_aprovacao"]);
    expect(KANBAN_STATUSES).not.toContain("concluida");
    expect(KANBAN_STATUSES).not.toContain("cancelada");
  });

  it("as colunas do Kanban são um subconjunto dos status canônicos", () => {
    for (const s of KANBAN_STATUSES) expect(TASK_STATUSES).toContain(s);
  });
});
