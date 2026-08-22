"use client";

// Matriz clínica × sistema — ADR 0007.
//
// Uma linha por clínica, uma coluna por sistema: a linha responde "o que essa
// clínica tem", a coluna responde "quem falta". Clicar no cabeçalho filtra as
// pendências daquela coluna, o que dá a leitura "por sistema" sem tela extra.
//
// O peso visual é INVERTIDO em relação ao usual: "configurado" recua para um
// ponto acinzentado e "pronta" recebe o acento de marca. A tela existe para
// agir — maioria verde não informa nada, e um vazio acionável não deve ser mais
// discreto que um sucesso.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SYSTEM_KEYS, SYSTEM_LABELS, STATE_LABELS, isPending, tally,
  type SystemKey, type SystemState, type SystemsRow,
} from "@/lib/systems/types";

// Ponto + rótulo. O ponto carrega a cor; o rótulo carrega o peso. `pronta` é o
// único que usa o roxo de marca — é onde a atenção deve cair.
const DOT: Record<SystemState, string> = {
  pronta: "bg-primary",
  parcial: "bg-amber-500",
  bloqueada: "bg-destructive",
  ok: "bg-emerald-500/70",
  off: "bg-muted-foreground/50",
  na: "border border-border bg-transparent",
};
const TEXT: Record<SystemState, string> = {
  pronta: "font-semibold text-primary",
  parcial: "font-medium text-amber-500",
  bloqueada: "font-medium text-destructive",
  ok: "text-muted-foreground",
  off: "text-muted-foreground",
  na: "text-muted-foreground/60",
};

/** Onde o estado daquele sistema é lido — mostrado no painel lateral. */
const SOURCE: Record<SystemKey, string> = {
  automacao: "clinic_control.clinic_integrations + public.automacao_clinicas",
  aniversariantes: "aniversariantes.aniversariantes_clinicas",
  dashboard: "dashboards.clinics",
  helena: "clinic_control.clinic_integrations",
};

/**
 * Onde cada sistema é configurado de fato. A matriz é o eixo do ESTADO; a
 * configuração profunda continua na página que já a fazia bem — o modelo de
 * dois eixos do ADR 0007 não pede centralizar UI, pede um lugar único para
 * enxergar. Daí Helena apontar para a própria página, que tem tokens, webhooks
 * e sync por conta, coisas que não cabem numa célula.
 */
function deepLink(key: SystemKey, clinicId: string): { href: string; where: string } {
  if (key === "helena") return { href: "/helena", where: "em Contas Helena" };
  return { href: `/clinicas/${clinicId}/cadastro`, where: "na aba Cadastro" };
}

/**
 * O que fazer em cada estado.
 */
const NEXT_STEP: Record<SystemState, { cta: string; hint: string; act: boolean }> = {
  pronta: {
    cta: "Configurar",
    hint: "Todo pré-requisito já existe no Clinic Control — nada a digitar.",
    act: true,
  },
  parcial: {
    cta: "Completar",
    hint: "Existe, mas incompleto. Antes desta tela, este estado não aparecia em lugar nenhum.",
    act: true,
  },
  bloqueada: {
    cta: "Resolver pré-requisito",
    hint: "Falta um pré-requisito nesta clínica. Sem o company_id da Helena não há como identificar a conta nos outros sistemas.",
    act: true,
  },
  ok: { cta: "Revisar", hint: "Configurado. Abrir serve para conferir ou ajustar.", act: false },
  off: {
    cta: "Ligar",
    hint: "Desligado de propósito ou nunca ligado — a matriz não sabe distinguir os dois.",
    act: false,
  },
  na: { cta: "", hint: "Este sistema não integra com o prontuário desta clínica.", act: false },
};

const CONTRACT_LABEL: Record<string, string> = {
  active: "ativas",
  suspended: "suspensas",
  archived: "arquivadas",
};

export function SystemsMatrix({ rows }: { rows: SystemsRow[] }) {
  const [contract, setContract] = useState("active");
  const [onlyPending, setOnlyPending] = useState(false);
  const [colFilter, setColFilter] = useState<SystemKey | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ row: SystemsRow; key: SystemKey } | null>(null);

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
    <div className="flex flex-col gap-4">
      {/* Resumo antes do detalhe: é o contador que faz alguém agir. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SYSTEM_KEYS.map((k) => {
          const t = tally(scoped, k);
          const elegiveis = scoped.length - t.na;
          const pend = t.pronta + t.parcial + t.bloqueada;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setColFilter(colFilter === k ? null : k);
                setOnlyPending(false);
              }}
              className={cn(
                "flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-left transition-colors",
                colFilter === k ? "border-primary" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">{SYSTEM_LABELS[k]}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {t.ok}/{elegiveis}
                </span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                {t.ok > 0 && <i className="bg-emerald-500/70" style={{ flex: t.ok }} />}
                {t.pronta > 0 && <i className="bg-primary" style={{ flex: t.pronta }} />}
                {t.parcial > 0 && <i className="bg-amber-500" style={{ flex: t.parcial }} />}
                {t.bloqueada > 0 && <i className="bg-destructive" style={{ flex: t.bloqueada }} />}
                {t.off > 0 && <i className="bg-muted-foreground/40" style={{ flex: t.off }} />}
              </div>
              <span className="text-xs text-muted-foreground">
                {pend > 0 ? (
                  <>
                    <b className="font-semibold text-primary">{pend}</b>{" "}
                    {pend === 1 ? "pendência" : "pendências"}
                  </>
                ) : (
                  "nada pendente"
                )}
                {t.na > 0 && ` · ${t.na} não se aplica`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
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
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar clínica…"
          aria-label="Buscar clínica"
          className="h-9 w-full sm:w-56"
        />
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {visible.length} de {scoped.length}
          {colFilter && ` · pendências em ${SYSTEM_LABELS[colFilter]}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-56 bg-card">Clínica</TableHead>
              {SYSTEM_KEYS.map((k) => {
                const t = tally(scoped, k);
                return (
                  <TableHead key={k}>
                    <button
                      type="button"
                      onClick={() => {
                        setColFilter(colFilter === k ? null : k);
                        setOnlyPending(false);
                      }}
                      className="flex flex-col items-start gap-0.5 hover:text-foreground"
                      title="Filtrar pendências desta coluna"
                    >
                      <span>{SYSTEM_LABELS[k]}</span>
                      <span className="font-mono text-[11px] font-normal normal-case tracking-normal tabular-nums">
                        {t.ok}/{scoped.length - t.na}
                      </span>
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={SYSTEM_KEYS.length + 1} className="text-sm text-muted-foreground">
                  Nenhuma clínica com esse filtro.
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => (
              <TableRow key={r.clinicId}>
                <TableCell className="sticky left-0 z-10 bg-card">
                  <Link
                    href={`/clinicas/${r.clinicId}/cadastro`}
                    className="flex flex-col hover:underline"
                  >
                    <span className="text-sm font-medium">{r.clinicName}</span>
                    <span className="text-xs text-muted-foreground">{r.prontuario ?? "sem sistema"}</span>
                  </Link>
                </TableCell>
                {SYSTEM_KEYS.map((k) => {
                  const st = r.states[k];
                  const cell = (
                    <span className="flex items-center gap-2">
                      <i className={cn("size-[7px] shrink-0 rounded-full", DOT[st])} />
                      <span className={cn("text-xs", TEXT[st])}>{STATE_LABELS[st]}</span>
                      {r.hints[k] && (
                        <span className="font-mono text-[10px] text-muted-foreground">{r.hints[k]}</span>
                      )}
                    </span>
                  );
                  return (
                    <TableCell key={k}>
                      {st === "na" ? (
                        cell
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpen({ row: r, key: k })}
                          className="w-full text-left"
                        >
                          {cell}
                        </button>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        {(["pronta", "parcial", "bloqueada", "ok", "off", "na"] as SystemState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <i className={cn("size-[7px] rounded-full", DOT[s])} />
            {STATE_LABELS[s]}
            {s === "pronta" && " — é aqui que você age"}
            {s === "na" && " (não se aplica)"}
          </span>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{SYSTEM_LABELS[open.key]}</DialogTitle>
                <DialogDescription>
                  {open.row.clinicName} · prontuário: {open.row.prontuario ?? "não informado"}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Estado</dt>
                <dd className={TEXT[open.row.states[open.key]]}>
                  {STATE_LABELS[open.row.states[open.key]]}
                  {open.row.hints[open.key] && ` — ${open.row.hints[open.key]}`}
                </dd>
                <dt className="text-muted-foreground">Contrato</dt>
                <dd>{CONTRACT_LABEL[open.row.contractStatus] ?? open.row.contractStatus}</dd>
                <dt className="text-muted-foreground">Fonte</dt>
                <dd className="break-all font-mono text-xs">{SOURCE[open.key]}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                {NEXT_STEP[open.row.states[open.key]].hint}
              </p>
              {open.key === "dashboard" && open.row.states.dashboard !== "ok" && (
                <p className="text-xs text-amber-500">
                  O wizard do Dashboard ainda vive no app DashBoard-s (`/setup`). Trazê-lo
                  para cá é a issue #70 — até lá, esta coluna mostra o estado mas a
                  configuração acontece do outro lado.
                </p>
              )}
              <Link
                href={deepLink(open.key, open.row.clinicId).href}
                className={cn(
                  buttonVariants({
                    variant: NEXT_STEP[open.row.states[open.key]].act ? "default" : "outline",
                  }),
                  "gap-1.5",
                )}
              >
                {NEXT_STEP[open.row.states[open.key]].cta}{" "}
                {deepLink(open.key, open.row.clinicId).where}
                <ExternalLink className="size-3.5" />
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
