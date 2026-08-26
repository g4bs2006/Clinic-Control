"use client";

import { X, Minimize2, Maximize2, Loader2, PictureInPicture2 } from "lucide-react";
import { useTaskPanel } from "./task-panel-context";
import { TaskDetailDialog } from "./task-detail-dialog";

/**
 * Overlay ancorado no canto (estilo "mini-player"): minimizável para uma barrinha
 * e expansível de volta para o detalhe completo. Vive no layout, então persiste
 * entre navegações — a tarefa continua aberta enquanto você troca de página.
 */
export function TaskPanel() {
  const {
    taskId,
    minimized,
    title,
    supportLoaded,
    clinics,
    profiles,
    categories,
    currentUserId,
    isGestor,
    close,
    minimize,
    expand,
    markDirty,
  } = useTaskPanel();

  if (!taskId) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[1400] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-brand/40 bg-card py-1.5 pl-3 pr-1.5 shadow-xl shadow-black/40">
        <button
          type="button"
          onClick={expand}
          title="Expandir painel"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="size-2 shrink-0 rounded-full bg-brand" />
          <span className="truncate text-sm font-medium">{title ?? "Tarefa"}</span>
        </button>
        <button
          type="button"
          onClick={expand}
          title="Expandir painel"
          aria-label="Expandir painel"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Maximize2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={close}
          title="Fechar painel"
          aria-label="Fechar painel"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-2 bottom-2 z-[1400] flex max-h-[85dvh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/50 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[26rem]">
      {/* Barra de controle (não usa backdrop — a página continua visível por trás) */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tarefa
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              minimize()
              window.open(`/popup/${taskId}`, "clinic-task-popup", "width=440,height=720,resizable=yes")
            }}
            title="Abrir em janela separada (fica visível ao trocar de aba)"
            aria-label="Abrir em janela separada"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PictureInPicture2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={minimize}
            title="Minimizar"
            aria-label="Minimizar"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Minimize2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={close}
            title="Fechar painel"
            aria-label="Fechar painel"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Corpo do detalhe — reaproveita o TaskDetailDialog em modo painel */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!supportLoaded ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <TaskDetailDialog
            variant="panel"
            taskId={taskId}
            clinics={clinics}
            profiles={profiles}
            categories={categories}
            currentUserId={currentUserId}
            isGestor={isGestor}
            onClose={close}
            onChanged={markDirty}
            onDeleted={markDirty}
            onPinned={markDirty}
          />
        )}
      </div>
    </div>
  );
}
