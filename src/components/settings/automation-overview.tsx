"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  startAutomationScan,
  getAutomationJob,
  kickAutomationJob,
  type AutomationJob,
  type AutomationOverviewItem,
} from "@/lib/clinics/automation-actions";

const READINESS_STYLE: Record<string, { label: string; cls: string }> = {
  completa: { label: "Completa", cls: "bg-emerald-500/15 text-emerald-400" },
  parcial: { label: "Parcial", cls: "bg-amber-500/15 text-amber-400" },
  vazia: { label: "Não configurada", cls: "bg-zinc-500/15 text-zinc-400" },
};

/**
 * Panorama da automação na carteira + botão de varredura em lote.
 *
 * A lista vem do servidor e sobe para estado local (padrão do projeto) para
 * reconciliar quando a varredura termina e o router traz dados novos.
 */
export function AutomationOverview({
  initialItems,
  orphans,
}: {
  initialItems: AutomationOverviewItem[];
  orphans: string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prev, setPrev] = useState(initialItems);
  const [job, setJob] = useState<AutomationJob | null>(null);
  const [isStarting, startScan] = useTransition();

  // Resync render-time: quando o servidor manda lista nova, o estado local segue.
  if (prev !== initialItems) {
    setPrev(initialItems);
    setItems(initialItems);
  }

  // Polling do job em andamento. Também reencosta o tick (auto-kick) — se o
  // encadeamento servidor-a-servidor se perder, o job não fica preso na fila.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    pollRef.current = setInterval(async () => {
      const res = await getAutomationJob(job.id);
      if (!res.ok) return;
      setJob(res.job);
      if (res.job.status === "done" || res.job.status === "error") {
        const stats = res.job.stats;
        toast.success("Varredura concluída", {
          description: `${stats?.detected ?? 0} clínica(s) varridas · ${stats?.applied ?? 0} campo(s) preenchidos · ${stats?.incomplete ?? 0} com pendência`,
        });
        router.refresh();
      } else if (res.job.status === "queued") {
        await kickAutomationJob(job.id);
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, router]);

  function handleScan() {
    startScan(async () => {
      const res = await startAutomationScan(true);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setJob(res.job);
      toast.success("Varredura iniciada", {
        description: `${res.job.progress_total} clínica(s) na fila. Pode sair da tela — o progresso continua.`,
      });
    });
  }

  const running = job && job.status !== "done" && job.status !== "error";
  const withPendency = items.filter(
    (i) => i.readiness !== "completa" || i.divergences.length > 0 || i.warnings.length > 0,
  );

  return (
    <div className="space-y-4">
      {/* Ações + contadores: empilha no mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{items.filter((i) => i.enabled).length}</strong>{" "}
            ativas
          </span>
          <span>
            <strong className="text-foreground">
              {items.filter((i) => i.readiness === "completa").length}
            </strong>{" "}
            completas
          </span>
          <span>
            <strong className="text-amber-400">{withPendency.length}</strong> com pendência
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleScan}
          disabled={isStarting || Boolean(running)}
          className="w-full sm:w-auto"
        >
          {running ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Varrendo {job!.progress_done}/{job!.progress_total}…
            </>
          ) : (
            <>
              <RefreshCw className="size-3.5" />
              Detectar na carteira
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        A varredura consulta a Helena de cada clínica e preenche só os campos que estão vazios —
        nunca sobrescreve escolha manual. Roda também sozinha toda segunda de manhã.
      </p>

      {job?.stats?.errors && job.stats.errors.length > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-400">
          <p className="font-medium">Falhas na última varredura:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {job.stats.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {orphans.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <p className="font-medium">
              {orphans.length} linha(s) na tabela do n8n sem clínica correspondente aqui
            </p>
            <p className="mt-0.5 text-amber-400/80">
              A automação pode estar rodando para conta que o Clinic Control não conhece (ou fora da
              carteira selecionada): {orphans.join(" · ")}
            </p>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma clínica com integração Helena na carteira selecionada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left">
                <th className="px-3 py-2 font-medium text-muted-foreground">Clínica</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Estado</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Ativa</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const style = READINESS_STYLE[i.readiness] ?? READINESS_STYLE.vazia;
                return (
                  <tr key={i.clinicId} className="border-b border-border/30 last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/clinicas/${i.clinicId}/cadastro`}
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand"
                      >
                        {i.clinicName}
                        <ExternalLink className="size-3 opacity-50" />
                      </Link>
                      <span className="ml-2 text-[0.65rem] text-muted-foreground">{i.mode}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${style.cls}`}
                      >
                        {style.label}
                      </span>
                      {i.missingCount > 0 && (
                        <span className="ml-2 text-[0.65rem] text-muted-foreground tabular-nums">
                          {i.missingCount} vazio(s)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{i.enabled ? "sim" : "não"}</td>
                    <td className="px-3 py-2">
                      {i.divergences.length === 0 && i.warnings.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-0.5 text-xs text-amber-400/90">
                          {i.divergences.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                          {i.warnings.slice(0, 2).map((w) => (
                            <li key={w} className="text-muted-foreground">
                              {w}
                            </li>
                          ))}
                          {i.warnings.length > 2 && (
                            <li className="text-muted-foreground">
                              +{i.warnings.length - 2} aviso(s)
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
