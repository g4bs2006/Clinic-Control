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
// Usa o MESMO vocabulário visual da matriz: pílula `rounded-full text-[0.62rem]`
// na família do READINESS_STYLE de automation-overview. Dois desenhos para o
// mesmo estado seria a divergência aparecendo por outra porta.
//
// Server component: sem hooks, sem "use client".
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SYSTEM_KEYS, SYSTEM_LABELS, STATE_LABELS, isPending,
  type SystemState, type SystemsRow,
} from "@/lib/systems/types";

const PILL: Record<SystemState, string> = {
  pronta: "bg-primary/15 text-primary",
  parcial: "bg-amber-500/15 text-amber-400",
  bloqueada: "bg-red-500/15 text-red-400",
  ok: "bg-emerald-500/15 text-emerald-400",
  off: "bg-zinc-500/15 text-zinc-400",
  na: "bg-transparent text-muted-foreground/60",
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
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {SYSTEM_KEYS.map((k) => {
          const st = row.states[k];
          const conteudo = (
            <>
              <span className={cn(st === "na" && "text-muted-foreground/60")}>
                {SYSTEM_LABELS[k]}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.62rem] font-semibold",
                  PILL[st],
                )}
              >
                {STATE_LABELS[st]}
              </span>
              {row.hints[k] && (
                <span className="text-[0.65rem] text-muted-foreground">{row.hints[k]}</span>
              )}
            </>
          );

          // `na` não é clicável: não há configuração possível para um prontuário
          // que o sistema não integra, e um link que abre "não se aplica" só
          // ensina a não clicar.
          if (st === "na") {
            return (
              <span key={k} className="inline-flex items-center gap-2 text-sm">
                {conteudo}
              </span>
            );
          }

          return (
            <Link
              key={k}
              href={`/sistemas/${row.clinicId}/${k}`}
              className="inline-flex items-center gap-2 text-sm hover:opacity-85"
              title={`Configurar ${SYSTEM_LABELS[k]}`}
            >
              {conteudo}
            </Link>
          );
        })}
      </div>

      <Link
        href="/sistemas"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-brand"
      >
        {pendentes.length > 0
          ? `Ver ${pendentes.length === 1 ? "a pendência" : `as ${pendentes.length} pendências`} na carteira`
          : "Ver todos os sistemas da carteira"}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
