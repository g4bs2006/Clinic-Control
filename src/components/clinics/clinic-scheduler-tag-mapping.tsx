"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  getSchedulerTagSetup,
  saveSchedulerTagMapping,
  type SchedulerTagOption,
} from "@/lib/clinics/integration-actions";

interface ClinicSchedulerTagMappingProps {
  clinicId: string;
}

type Bucket = "crc" | "ia";

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "crc", label: "CRC" },
  { key: "ia", label: "IA" },
];

/**
 * Configuração de "quem agendou" (CRC vs IA) por etiqueta do card — dimensão
 * independente do mapeamento de colunas. Sem fallback canônico: etiquetas não
 * seguem convenção de nome entre clínicas, então até a pré-seleção por nome
 * exato ("CRC"/"IA") é só um ponto de partida, não uma garantia.
 */
export function ClinicSchedulerTagMapping({ clinicId }: ClinicSchedulerTagMappingProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tags, setTags] = useState<SchedulerTagOption[]>([]);
  const [sel, setSel] = useState<Record<Bucket, Set<string>>>({
    crc: new Set(),
    ia: new Set(),
  });
  const [isLoading, startLoad] = useTransition();
  const [isSaving, startSave] = useTransition();

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      startLoad(async () => {
        const res = await getSchedulerTagSetup(clinicId);
        if (!res.ok) {
          toast.error(res.error);
          setOpen(false);
          return;
        }
        setTags(res.setup.tags);
        setSel({
          crc: new Set(res.setup.crcTagIds),
          ia: new Set(res.setup.iaTagIds),
        });
        setLoaded(true);
      });
    }
  }

  function toggleCell(bucket: Bucket, tagId: string, checked: boolean) {
    setSel((prev) => {
      const nextSet = new Set(prev[bucket]);
      if (checked) nextSet.add(tagId);
      else nextSet.delete(tagId);
      return { ...prev, [bucket]: nextSet };
    });
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveSchedulerTagMapping(clinicId, {
        crcTagIds: [...sel.crc],
        iaTagIds: [...sel.ia],
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Mapeamento de etiquetas salvo");
    });
  }

  return (
    <div className="rounded-lg border border-border/50">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <Tags className="size-3.5" />
          Configurar quem agendou (CRC / IA)
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border/50 p-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando etiquetas…</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma etiqueta cadastrada nesse painel da Helena.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Marque qual etiqueta identifica um agendamento feito pelo CRC (time humano) e
                qual identifica um agendamento feito pela IA. Cards agendados sem nenhuma dessas
                etiquetas entram como &quot;não classificado&quot;.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="p-2 text-left font-medium text-muted-foreground">Etiqueta</th>
                      {BUCKETS.map((b) => (
                        <th key={b.key} className="p-2 text-center font-medium text-muted-foreground">
                          {b.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tags.map((tag) => (
                      <tr key={tag.id} className="border-b border-border/30 last:border-0">
                        <td className="p-2 truncate max-w-[14rem]" title={tag.name}>
                          {tag.name}
                        </td>
                        {BUCKETS.map((b) => {
                          const checked = sel[b.key].has(tag.id);
                          return (
                            <td key={b.key} className="p-0 text-center">
                              {/* Célula inteira clicável — mesmo padrão do mapeamento de colunas */}
                              <button
                                type="button"
                                onClick={() => toggleCell(b.key, tag.id, !checked)}
                                aria-pressed={checked}
                                aria-label={`${b.label}: ${tag.name}`}
                                className="flex w-full items-center justify-center px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              >
                                <Checkbox checked={checked} tabIndex={-1} className="size-5 pointer-events-none" />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
