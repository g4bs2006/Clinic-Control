"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { resolveStatus, type StatusRule } from "@/lib/snapshots/status";
import { upsertManualSnapshot } from "@/lib/snapshots/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GridRow = {
  clinicId: string;
  name: string;
  cityUf: string;
  mode: "auto" | "manual";
  source: "auto" | "manual" | null;
  leads: number | null;
  scheduled: number | null;
  rate: number | null;
  statusOverride: string | null;
  frozen: boolean;
  editable: boolean;
};

type Props = {
  month: string; // YYYY-MM
  rows: GridRow[];
  rules: StatusRule[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRate(rate: number | null): string {
  if (rate === null) return "—";
  return (rate * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + "%";
}

function fmtNum(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("pt-BR");
}

function StatusBadge({
  rate,
  override,
  rules,
}: {
  rate: number | null;
  override: string | null;
  rules: StatusRule[];
}) {
  if (rate === null) return <span className="text-muted-foreground text-xs">—</span>;
  const resolved = resolveStatus({ rate, override: override ?? undefined, rules });
  if (!resolved) return <span className="text-muted-foreground text-xs">—</span>;

  // Determine readable text color based on background
  // Simple heuristic: parse hex color and check luminance
  const bg = resolved.color;
  let textColor = "#ffffff";
  try {
    if (bg.startsWith("#") && bg.length === 7) {
      const r = parseInt(bg.slice(1, 3), 16);
      const g = parseInt(bg.slice(3, 5), 16);
      const b = parseInt(bg.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      textColor = luminance > 0.5 ? "#1a1a1a" : "#ffffff";
    }
  } catch {
    /* keep white */
  }

  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {resolved.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Editable row cell pair
// ---------------------------------------------------------------------------

function parseSafeInt(raw: string): number | null {
  if (raw === "") return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function EditableRow({
  row,
  month,
  rules,
}: {
  row: GridRow;
  month: string;
  rules: StatusRule[];
}) {
  const router = useRouter();
  const [leads, setLeads] = useState<number | null>(row.leads);
  const [scheduled, setScheduled] = useState<number | null>(row.scheduled);
  const [saving, setSaving] = useState(false);

  const localRate =
    leads === null || scheduled === null ? null : leads === 0 ? 0 : scheduled / leads;

  async function handleSave() {
    if (leads === null || scheduled === null) return;
    setSaving(true);
    try {
      const result = await upsertManualSnapshot(row.clinicId, month, leads, scheduled);
      if (!result.ok) {
        toast.error(`Erro ao salvar ${row.name}: ${result.error}`);
      } else {
        toast.success(`${row.name} salvo`);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  return (
    <>
      <TableCell>
        <input
          type="number"
          min={0}
          value={leads ?? ""}
          disabled={saving}
          onChange={(e) => setLeads(parseSafeInt(e.target.value))}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-20 rounded border border-border bg-input px-2 py-1 text-sm text-foreground
                     focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          placeholder="0"
        />
      </TableCell>
      <TableCell>
        <input
          type="number"
          min={0}
          value={scheduled ?? ""}
          disabled={saving}
          onChange={(e) => setScheduled(parseSafeInt(e.target.value))}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-20 rounded border border-border bg-input px-2 py-1 text-sm text-foreground
                     focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          placeholder="0"
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{fmtRate(localRate)}</TableCell>
      <TableCell>
        <StatusBadge rate={localRate} override={row.statusOverride} rules={rules} />
      </TableCell>
    </>
  );
}

/** Versão em card (mobile) da linha editável — edição empilhada, sem tabela. */
function EditableCard({ row, month, rules }: { row: GridRow; month: string; rules: StatusRule[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState<number | null>(row.leads);
  const [scheduled, setScheduled] = useState<number | null>(row.scheduled);
  const [saving, setSaving] = useState(false);
  const localRate = leads === null || scheduled === null ? null : leads === 0 ? 0 : scheduled / leads;

  async function handleSave() {
    if (leads === null || scheduled === null) return;
    setSaving(true);
    try {
      const result = await upsertManualSnapshot(row.clinicId, month, leads, scheduled);
      if (!result.ok) toast.error(`Erro ao salvar ${row.name}: ${result.error}`);
      else {
        toast.success(`${row.name} salvo`);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "h-9 w-full rounded border border-border bg-input px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{row.name}</span>
        <StatusBadge rate={localRate} override={row.statusOverride} rules={rules} />
      </div>
      {row.cityUf && <p className="mt-0.5 text-xs text-muted-foreground">{row.cityUf}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Leads
          <input
            type="number"
            min={0}
            value={leads ?? ""}
            disabled={saving}
            onChange={(e) => setLeads(parseSafeInt(e.target.value))}
            onBlur={handleSave}
            className={inputCls}
            placeholder="0"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Agendados
          <input
            type="number"
            min={0}
            value={scheduled ?? ""}
            disabled={saving}
            onChange={(e) => setScheduled(parseSafeInt(e.target.value))}
            onBlur={handleSave}
            className={inputCls}
            placeholder="0"
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Taxa: <strong className="text-foreground">{fmtRate(localRate)}</strong>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthlyGrid
// ---------------------------------------------------------------------------

export function MonthlyGrid({ month, rows, rules }: Props) {
  const router = useRouter();

  const handleMonthChange = useCallback(
    (value: string) => {
      if (!value) return;
      router.push(`/mensal?month=${value}`);
    },
    [router],
  );

  // Navigation: prev/next month
  function adjustMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const newKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    router.push(`/mensal?month=${newKey}`);
  }

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => adjustMonth(-1)}
          className="rounded border border-border bg-secondary px-3 py-1.5 text-sm
                     text-secondary-foreground hover:bg-secondary/80 transition-colors"
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <input
          type="month"
          value={month}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground
                     focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => adjustMonth(1)}
          className="rounded border border-border bg-secondary px-3 py-1.5 text-sm
                     text-secondary-foreground hover:bg-secondary/80 transition-colors"
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      {/* Cards no mobile */}
      <div className="space-y-2 sm:hidden">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma clínica encontrada.</p>
        )}
        {rows.map((row) =>
          row.editable ? (
            <EditableCard key={`${month}:${row.clinicId}`} row={row} month={month} rules={rules} />
          ) : (
            <div key={`${month}:${row.clinicId}`} className="rounded-lg border border-border/60 bg-card p-3 opacity-90">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.name}</span>
                <StatusBadge rate={row.rate} override={row.statusOverride} rules={rules} />
              </div>
              {row.cityUf && <p className="mt-0.5 text-xs text-muted-foreground">{row.cityUf}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
                <span>Leads <strong className="text-foreground">{fmtNum(row.leads)}</strong></span>
                <span>Agendados <strong className="text-foreground">{fmtNum(row.scheduled)}</strong></span>
                <span>Taxa <strong className="text-foreground">{fmtRate(row.rate)}</strong></span>
              </div>
            </div>
          ),
        )}
      </div>

      {/* Grid (desktop) */}
      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="pl-4">Clínica</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Agendados</TableHead>
              <TableHead>Taxa</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma clínica encontrada.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              if (row.editable) {
                return (
                  <TableRow key={`${month}:${row.clinicId}`}>
                    <TableCell className="pl-4 font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.cityUf || "—"}</TableCell>
                    <EditableRow
                      row={row}
                      month={month}
                      rules={rules}
                    />
                  </TableRow>
                );
              }

              // Read-only row (auto / frozen)
              return (
                <TableRow key={`${month}:${row.clinicId}`} className="opacity-80">
                  <TableCell className="pl-4 font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.cityUf || "—"}</TableCell>
                  <TableCell className="text-sm">{fmtNum(row.leads)}</TableCell>
                  <TableCell className="text-sm">{fmtNum(row.scheduled)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtRate(row.rate)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge rate={row.rate} override={row.statusOverride} rules={rules} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Linhas com fundo editável (manual). Linhas auto = somente leitura (ao vivo no mês corrente
        / congeladas em meses passados).
        {/* TODO: status override editing per row (nice-to-have, Fase 4 or later) */}
      </p>
    </div>
  );
}
