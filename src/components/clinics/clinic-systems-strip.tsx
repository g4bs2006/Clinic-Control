// Faixa compacta de sistemas na aba Cadastro — ADR 0007.
//
// Substitui os painéis de configuração que moravam aqui. A aba volta a ser sobre
// A CLÍNICA (ficha, detalhes, anotações, arquivos) e esta faixa responde "o que
// esta clínica tem", que é a pergunta que se faz quando você está numa ligação
// sobre ela. A configuração em si mora em /sistemas.
//
// Deriva o estado pela MESMA função da matriz (getClinicSystems → deriveAll).
// O ADR 0007 registra a divergência entre as duas telas como a consequência mais
// provável da decisão; duas implementações da mesma regra é como ela apareceria.
//
// Server component: sem hooks, sem "use client".
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SYSTEM_KEYS, SYSTEM_LABELS, STATE_LABELS, isPending,
  type SystemState, type SystemsRow,
} from "@/lib/systems/types";

const DOT: Record<SystemState, string> = {
  pronta: "bg-primary",
  parcial: "bg-amber-500",
  bloqueada: "bg-destructive",
  ok: "bg-emerald-500/70",
  off: "bg-muted-foreground/50",
  na: "border border-border bg-transparent",
};

export function ClinicSystemsStrip({ row }: { row: SystemsRow | null }) {
  if (!row) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível ler o estado dos sistemas desta clínica.
      </p>
    );
  }

  const pendentes = SYSTEM_KEYS.filter((k) => isPending(row.states[k]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {SYSTEM_KEYS.map((k) => {
          const st = row.states[k];
          return (
            <span
              key={k}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                isPending(st) ? "border-primary/40 bg-primary/5" : "border-border bg-card",
                st === "na" && "opacity-60",
              )}
            >
              <i className={cn("size-[7px] shrink-0 rounded-full", DOT[st])} />
              <span className="font-medium">{SYSTEM_LABELS[k]}</span>
              <span className="text-muted-foreground">{STATE_LABELS[st]}</span>
              {row.hints[k] && (
                <span className="font-mono text-[10px] text-muted-foreground">{row.hints[k]}</span>
              )}
            </span>
          );
        })}
      </div>

      <Link
        href="/sistemas"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {pendentes.length > 0
          ? `Configurar ${pendentes.length === 1 ? "o pendente" : `os ${pendentes.length} pendentes`} em Sistemas`
          : "Ver todos os sistemas da carteira"}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
