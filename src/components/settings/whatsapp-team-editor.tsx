"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addTeamMember,
  deleteTeamMember,
  type TeamMemberRow,
} from "@/lib/whatsapp/actions"

interface WhatsappTeamEditorProps {
  initialMembers: TeamMemberRow[]
  /** Desenvolvedor: só visualiza (sem adicionar/remover). */
  readOnly?: boolean
}

export function WhatsappTeamEditor({ initialMembers, readOnly = false }: WhatsappTeamEditorProps) {
  const confirm = useConfirm()
  const [members, setMembers] = useState(initialMembers)
  const [name, setName] = useState("")
  const [lid, setLid] = useState("")
  const [kind, setKind] = useState<"human" | "bot">("human")
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      const res = await addTeamMember({ lid, name, kind })
      if (res.ok) {
        // Insere a linha retornada na hora — sem refetch de página inteira.
        setMembers((prev) => [...prev, res.member])
        toast.success("Membro adicionado.")
        setName("")
        setLid("")
        setKind("human")
      } else {
        toast.error(res.error)
      }
    })
  }

  async function remove(id: string) {
    const m = members.find((x) => x.id === id)
    const ok = await confirm({
      title: "Remover membro?",
      description: `${m?.name ?? "Este contato"} deixa de contar como resposta humana nos grupos.`,
      confirmLabel: "Remover",
      destructive: true,
    })
    if (!ok) return
    // Otimista: some da lista na hora; re-insere se o servidor recusar.
    const snapshot = members
    setMembers((prev) => prev.filter((m) => m.id !== id))
    startTransition(async () => {
      const res = await deleteTeamMember(id)
      if (res.ok) {
        toast.success("Membro removido.")
      } else {
        setMembers(snapshot)
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {members.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
          Nenhum membro cadastrado ainda. Adicione a equipe abaixo para o cálculo de tempo de resposta.
        </p>
      ) : (
      <ul className="flex flex-col gap-1.5">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-md border border-border/60 bg-accent/20 px-3 py-2"
          >
            <span className="flex-1 truncate text-sm text-foreground">
              {m.name ?? "(sem nome)"}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{m.lid ?? "—"}</span>
            <span
              className={
                m.kind === "bot"
                  ? "rounded-full bg-[oklch(0.65_0.18_290)]/15 px-2 py-0.5 text-[0.65rem] font-semibold text-[oklch(0.72_0.15_290)]"
                  : "rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-semibold text-white shadow-sm"
              }
            >
              {m.kind === "bot" ? "Bot" : "Equipe"}
            </span>
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => remove(m.id)}
              >
                Remover
              </Button>
            )}
          </li>
        ))}
      </ul>
      )}

      {!readOnly && (
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_12rem_8rem_auto]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Maria — contact.IA)"
          className="h-8"
        />
        <Input
          value={lid}
          onChange={(e) => setLid(e.target.value)}
          placeholder="ID @lid (só dígitos)"
          inputMode="numeric"
          className="h-8 tabular-nums"
        />
        <Select
          value={kind}
          items={{ human: "Equipe", bot: "Bot" }}
          onValueChange={(v) => v && setKind(v as "human" | "bot")}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="human">Equipe</SelectItem>
            <SelectItem value="bot">Bot</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={add}>
          Adicionar
        </Button>
      </div>
      )}

      <p className="text-xs text-muted-foreground">
        Mensagens de <strong>Equipe</strong> param o relógio do tempo de resposta;
        mensagens de <strong>Bot</strong> são ignoradas no cálculo. O ID @lid de um
        remetente aparece na coluna <code>participant</code> das mensagens coletadas.
      </p>
    </div>
  )
}
