"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { updateGroupClinic, syncWhatsappGroups, type WhatsappGroupRow } from "@/lib/whatsapp/actions"

const NONE = "__none__"

interface WhatsappGroupsEditorProps {
  groups: WhatsappGroupRow[]
  clinics: { id: string; name: string }[]
  /** Desenvolvedor: só visualiza (sem sincronizar nem remapear). */
  readOnly?: boolean
}

export function WhatsappGroupsEditor({ groups, clinics, readOnly = false }: WhatsappGroupsEditorProps) {
  const router = useRouter()
  const [byJid, setByJid] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(groups.map((g) => [g.group_jid, g.clinic_id])),
  )
  const [pending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)

  function sync() {
    setSyncing(true)
    startTransition(async () => {
      const res = await syncWhatsappGroups()
      setSyncing(false)
      if (res.ok) {
        // Só descoberta: a coleta de mensagens fica com o cron (leva ~120s e
        // não caberia no tempo desta ação).
        toast.success(`${res.groupsFetched} grupos encontrados na Evolution.`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function onChange(groupJid: string, val: string | null) {
    if (!val) return
    const next = val === NONE ? null : val
    const prev = byJid[groupJid] ?? null
    if (next === prev) return
    setByJid((m) => ({ ...m, [groupJid]: next })) // optimistic

    startTransition(async () => {
      const res = await updateGroupClinic(groupJid, next)
      if (!res.ok) {
        setByJid((m) => ({ ...m, [groupJid]: prev })) // revert
        toast.error(res.error)
      } else {
        toast.success("Grupo atualizado")
      }
    })
  }

  const mapped = Object.values(byJid).filter(Boolean).length
  const clinicName = (id: string | null) =>
    id ? (clinics.find((c) => c.id === id)?.name ?? "(clínica removida)") : "— Sem clínica —"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {mapped} de {groups.length} grupos mapeados. Grupos sem clínica (internos ou
          de outras carteiras) ficam fora do cálculo do tempo de resposta.
        </p>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={syncing}
            onClick={sync}
            title="Busca na Evolution os grupos novos (ex.: clínica que acabou de entrar)"
          >
            <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            Buscar grupos novos
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
          Nenhum grupo sincronizado ainda.
          {!readOnly && " Clique em “Buscar grupos novos” para importar os grupos da Evolution."}
        </p>
      ) : (
      <ul className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-1">
        {groups.map((g) => (
          <li
            key={g.group_jid}
            className="grid grid-cols-1 items-center gap-2 rounded-md border border-border/60 bg-accent/20 px-3 py-2 sm:grid-cols-[1fr_16rem]"
          >
            <span className="truncate text-sm text-foreground" title={g.group_jid}>
              {g.name ?? g.group_jid}
            </span>
            {readOnly ? (
              <span
                className={`truncate text-sm ${byJid[g.group_jid] ? "text-foreground" : "text-muted-foreground"}`}
              >
                {clinicName(byJid[g.group_jid] ?? null)}
              </span>
            ) : (
              <Select
                value={byJid[g.group_jid] ?? NONE}
                items={{
                  [NONE]: "— Sem clínica —",
                  ...Object.fromEntries(clinics.map((c) => [c.id, c.name])),
                }}
                onValueChange={(v) => onChange(g.group_jid, v)}
                disabled={pending}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Sem clínica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Sem clínica —</SelectItem>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}
