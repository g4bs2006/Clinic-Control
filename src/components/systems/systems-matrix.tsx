"use client";

// Matriz clínica × sistema — ADR 0007.
//
// Uma linha por clínica, uma coluna por sistema: a linha responde "o que essa
// clínica tem", a coluna responde "quem falta". Clicar no cabeçalho filtra as
// pendências daquela coluna, o que dá a leitura "por sistema" sem tela extra.
//
// O app tem dois padrões de tabela: o primitivo `ui/table` (clinic-table,
// monthly-grid) e tabela crua (automation-overview, helena-accounts-table).
// Esta usa o PRIMITIVO, porque a matriz é uma lista de clínicas e será lida ao
// lado de /clinicas — `clinic-table.tsx` é o parente mais próximo por conteúdo,
// e mudanças no primitivo devem propagar para cá.
//
// Do automation-overview vem o vocabulário de ESTADO (pílula
// `rounded-full text-[0.62rem]`, família do READINESS_STYLE), que é uma
// preocupação separada da marcação da tabela. E do clinic-table vem o
// tratamento do nome da clínica: `text-brand-gradient`.
//
// O peso visual dos estados é INVERTIDO em relação ao usual: "não se aplica" não
// ganha pílula nenhuma, "configurado" ganha uma discreta, e "pronta" ganha o
// acento de marca. A tela existe para agir — maioria verde não informa nada, e
// um vazio acionável não deve ser mais discreto que um sucesso.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { cn } from "@/lib/utils";
import {
  SYSTEM_KEYS, SYSTEM_LABELS, STATE_LABELS, isPending, tally,
  type SystemKey, type SystemState, type SystemsRow,
} from "@/lib/systems/types";

// Mesma família de classes do READINESS_STYLE de automation-overview.
const PILL: Record<SystemState, string> = {
  pronta: "bg-primary/15 text-primary",
  parcial: "bg-amber-500/15 text-amber-400",
  bloqueada: "bg-red-500/15 text-red-400",
  ok: "bg-emerald-500/15 text-emerald-400",
  off: "bg-zinc-500/15 text-zinc-400",
  na: "",
};

const CONTRACT_LABEL: Record<string, string> = {
  active: "ativas",
  suspended: "suspensas",
  archived: "arquivadas",
};

function StatePill({ state, hint }: { state: SystemState; hint?: string }) {
  // `na` sem pílula: é o estado mais frequente na coluna Aniversariantes (31 de
  // 61 clínicas ativas) e desenhá-lo tornaria a coluna ruidosa justamente onde
  // não há nada a fazer. Um travessão diz o suficiente.
  if (state === "na") {
    return <span className="text-[0.65rem] text-muted-foreground/60">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("rounded-full px-2 py-0.5 text-[0.62rem] font-semibold", PILL[state])}>
        {STATE_LABELS[state]}
      </span>
      {hint && <span className="text-[0.65rem] text-muted-foreground">{hint}</span>}
    </span>
  );
}

export function SystemsMatrix({ rows }: { rows: SystemsRow[] }) {
  const [contract, setContract] = useState("active");
  const [onlyPending, setOnlyPending] = useState(false);
  const [colFilter, setColFilter] = useState<SystemKey | null>(null);
  const [q, setQ] = useState("");

  const contracts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.contractStatus))).sort(),
    [rows],
  );

  // O escopo do contrato define os contadores também: "2 de 30" só significa
  // algo se as 30 forem as clínicas que você está olhando.
  const scoped = useMemo(
    () => rows.filter((r) => r.contractStatus === contract),
    [rows, contract],
  );

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return scoped.filter((r) => {
      if (term && !r.clinicName.toLowerCase().includes(term)) return false;
      if (colFilter) return isPending(r.states[colFilter]);
      if (onlyPending) return SYSTEM_KEYS.some((k) => isPending(r.states[k]));
      return true;
    });
  }, [scoped, q, colFilter, onlyPending]);

  return (
    <div className="space-y-4">
      {/* Resumo antes do detalhe: é o contador que faz alguém agir. O acento de
          marca vai nas colunas COM pendência — a atenção segue o trabalho. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SYSTEM_KEYS.map((k) => {
          const t = tally(scoped, k);
          const elegiveis = scoped.length - t.na;
          const pend = t.pronta + t.parcial + t.bloqueada;
          const partes = [
            t.pronta > 0 && `${t.pronta} pronta${t.pronta > 1 ? "s" : ""}`,
            t.parcial > 0 && `${t.parcial} parcial${t.parcial > 1 ? "is" : ""}`,
            t.bloqueada > 0 && `${t.bloqueada} bloqueada${t.bloqueada > 1 ? "s" : ""}`,
          ].filter(Boolean);
          return (
            <KpiCard
              key={k}
              label={SYSTEM_LABELS[k]}
              value={`${t.ok}/${elegiveis}`}
              accent={pend > 0 ? "teal" : undefined}
              hint={partes.length > 0 ? partes.join(" · ") : "nada pendente"}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          aria-label="Filtrar por contrato"
          className="h-9 rounded-md border border-border bg-card px-2 text-sm"
        >
          {contracts.map((c) => (
            <option key={c} value={c}>
              {CONTRACT_LABEL[c] ?? c}
            </option>
          ))}
        </select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar clínica…"
          aria-label="Buscar clínica"
          className="sm:max-w-sm"
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => {
              setOnlyPending(e.target.checked);
              setColFilter(null);
            }}
            className="size-4 accent-[var(--primary)]"
          />
          só com pendência
        </label>
        <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
          {visible.length} de {scoped.length}
          {colFilter && ` · pendências em ${SYSTEM_LABELS[colFilter]}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma clínica com esse filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clínica</TableHead>
                {SYSTEM_KEYS.map((k) => {
                  const t = tally(scoped, k);
                  const ativo = colFilter === k;
                  return (
                    <TableHead key={k}>
                      <button
                        type="button"
                        onClick={() => {
                          setColFilter(ativo ? null : k);
                          setOnlyPending(false);
                        }}
                        title="Filtrar pendências desta coluna"
                        className={cn(
                          "flex flex-col items-start gap-0.5 py-1 text-left",
                          ativo ? "text-brand" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span>{SYSTEM_LABELS[k]}</span>
                        <span className="text-[0.65rem] font-normal tabular-nums">
                          {t.ok}/{scoped.length - t.na}
                        </span>
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.clinicId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/clinicas/${r.clinicId}/cadastro`}
                      className="text-brand-gradient font-medium transition-opacity hover:opacity-85"
                    >
                      {r.clinicName}
                    </Link>
                    <span className="block text-[0.65rem] font-normal text-muted-foreground">
                      {r.prontuario ?? "sem sistema"}
                    </span>
                  </TableCell>
                  {SYSTEM_KEYS.map((k) => {
                    const st = r.states[k];
                    return (
                      <TableCell key={k}>
                        {st === "na" ? (
                          <StatePill state={st} />
                        ) : (
                          <Link
                            href={`/sistemas/${r.clinicId}/${k}`}
                            scroll={false}
                            className="inline-block"
                            title={`Configurar ${SYSTEM_LABELS[k]} — ${r.clinicName}`}
                          >
                            <StatePill state={st} hint={r.hints[k]} />
                          </Link>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.65rem] text-muted-foreground">
        {(["pronta", "parcial", "bloqueada", "ok", "off"] as SystemState[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", PILL[s])}>
              {STATE_LABELS[s]}
            </span>
            {s === "pronta" && "é aqui que você age"}
          </span>
        ))}
        <span>— não se aplica a esse prontuário</span>
      </div>

    </div>
  );
}
