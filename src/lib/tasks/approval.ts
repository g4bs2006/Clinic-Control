import { TASK_STATUSES, type TaskStatus } from "./categories";

/**
 * Etapa de aprovação (ADR 0010, estendida a todas as tarefas pelo ADR 0011).
 *
 * Antes do 0011 a regra era ramificada por natureza (`is_internal`), então cada
 * tela carregava a sua própria versão do "quem pode concluir". Com o fluxo
 * único, o que decide é só o papel de quem age — e a regra passa a ter um lar,
 * lido por Lista, Kanban, detalhe, ação em lote e formulário de criação. O gate
 * de verdade continua no servidor (`updateTaskStatus`/`bulkUpdateTaskStatus`/
 * `createTask`): daqui sai só a UI que não oferece o que seria recusado.
 */

/**
 * Colunas do Kanban: só trabalho aberto. Concluída e Cancelada ficam fora
 * porque virar o card na coluna final é um gesto silencioso — encerrar é uma
 * ação explícita no card. O que está fechado se vê no Histórico.
 */
export const KANBAN_STATUSES = ["pendente", "em_andamento", "em_aprovacao"] as const satisfies readonly TaskStatus[];

/** Quem não é gestor não conclui: manda para revisão. */
export function needsApproval(isGestor: boolean): boolean {
  return !isGestor;
}

/**
 * Para onde o botão "Concluir" aponta: gestor encerra; os demais enviam para
 * aprovação.
 */
export function concludeTarget(isGestor: boolean): TaskStatus {
  return isGestor ? "concluida" : "em_aprovacao";
}

/**
 * Status ofertáveis num select de tarefa. "Concluída" sai para quem não é
 * gestor — evita uma escolha que o servidor recusaria.
 */
export function statusOptions(isGestor: boolean): readonly TaskStatus[] {
  return isGestor ? TASK_STATUSES : TASK_STATUSES.filter((s) => s !== "concluida");
}
