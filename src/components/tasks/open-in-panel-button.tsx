"use client";

import { PanelRightOpen } from "lucide-react";
import { useTaskPanel } from "./task-panel-context";

/**
 * Botão explícito de "abrir no painel" (mini-player global). Usado em linhas de
 * tarefa, busca global, notificações e panorama. É um <button> real — em
 * lugares onde o pai já é um <button>, use o ícone inline em vez deste.
 */
export function OpenInPanelButton({
  taskId,
  className,
  title = "Abrir no painel",
}: {
  taskId: string;
  className?: string;
  title?: string;
}) {
  const { openTask } = useTaskPanel();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openTask(taskId);
      }}
      title={title}
      aria-label={title}
      className={
        className ??
        "flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground sm:size-8"
      }
    >
      <PanelRightOpen className="size-3.5" />
    </button>
  );
}
