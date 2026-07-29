"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { ExternalLink, Pencil, Loader2, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { updateClinicN8nUrl } from "@/lib/clinics/actions"

/**
 * Link do workflow do n8n da clínica. Só anotação: ninguém chama essa URL, ela
 * existe para abrir o workflow certo em um clique ao depurar a automação (achar
 * o workflow na lista do n8n pelo nome é ruim — vários não batem com o nome da
 * clínica no cadastro).
 *
 * Em repouso mostra o link clicável; o lápis troca para edição. Otimista com
 * rollback, como o resto das mutações do projeto.
 */
export function ClinicN8nUrl({
  clinicId,
  current,
}: {
  clinicId: string
  current: string | null
}) {
  const [url, setUrl] = useState(current ?? "")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current ?? "")
  const [pending, startTransition] = useTransition()

  function save() {
    const next = draft.trim()
    if (next === url) {
      setEditing(false)
      return
    }
    const prev = url
    setUrl(next) // otimista
    setEditing(false)

    startTransition(async () => {
      const res = await updateClinicN8nUrl(clinicId, next)
      if (!res.ok) {
        setUrl(prev) // rollback
        setDraft(prev)
        setEditing(true)
        toast.error(res.error)
        return
      }
      toast.success(next ? "Link do n8n salvo" : "Link do n8n removido", {
        description: next || undefined,
      })
    })
  }

  if (editing) {
    return (
      <div className="flex w-full flex-col gap-2 sm:w-96 sm:flex-row sm:items-center">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") {
              setDraft(url)
              setEditing(false)
            }
          }}
          placeholder="https://n8n.../workflow/..."
          aria-label="Link do workflow no n8n"
          className="h-8 text-sm"
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            Salvar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(url)
              setEditing(false)
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-[16rem] items-center gap-1 truncate text-sm text-brand hover:underline sm:max-w-sm"
            title={url}
          >
            <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
            <ExternalLink className="size-3 shrink-0 opacity-60" />
          </a>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Editar link do n8n"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft("")
              const prev = url
              setUrl("")
              startTransition(async () => {
                const res = await updateClinicN8nUrl(clinicId, "")
                if (!res.ok) {
                  setUrl(prev)
                  setDraft(prev)
                  toast.error(res.error)
                  return
                }
                toast.success("Link do n8n removido", {
                  description: "Desfazer volta o link anterior.",
                  action: {
                    label: "Desfazer",
                    onClick: () => {
                      setUrl(prev)
                      setDraft(prev)
                      void updateClinicN8nUrl(clinicId, prev)
                    },
                  },
                })
              })
            }}
            aria-label="Remover link do n8n"
            className="text-muted-foreground transition-colors hover:text-red-400"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          + adicionar link
        </button>
      )}
    </div>
  )
}
