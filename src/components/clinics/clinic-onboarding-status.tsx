"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Flag, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { setClinicOnboarded } from "@/lib/clinics/actions"

function dateLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("pt-BR", { timeZone: "UTC" })
}

/** Dias desde uma data YYYY-MM-DD (meio-dia BRT evita off-by-one). */
function daysSince(d: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(`${d}T12:00:00-03:00`).getTime()) / 86_400_000))
}

/**
 * Âncora do onboarding, junto do checklist de implantação: mostra "em andamento
 * · dia N" com o botão de concluir, ou a data de conclusão (com desfazer).
 * Alimenta o diagnóstico pós-onboarding (janela dos 30 primeiros dias).
 */
export function ClinicOnboardingStatus({
  clinicId,
  onboardedAt,
  createdAt,
}: {
  clinicId: string
  onboardedAt: string | null
  createdAt: string
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(onboardedAt)
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    startTransition(async () => {
      const res = await setClinicOnboarded(clinicId, next)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setCurrent(next ? new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10) : null)
      toast.success(next ? "Onboarding concluído." : "Onboarding reaberto.")
      router.refresh()
    })
  }

  if (current) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs">
        <CheckCircle2 className="size-3.5 text-emerald-400" />
        <span className="text-emerald-400">
          Onboarding concluído em <strong>{dateLabel(current)}</strong>
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(false)}
          className="ml-auto text-muted-foreground hover:text-foreground hover:underline"
        >
          desfazer
        </button>
      </div>
    )
  }

  const dia = daysSince(createdAt.slice(0, 10)) + 1
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs">
      <Flag className="size-3.5 text-amber-400" />
      <span className="text-amber-400">
        Onboarding em andamento · dia {dia}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        className="ml-auto h-7"
        onClick={() => toggle(true)}
      >
        Concluir onboarding
      </Button>
    </div>
  )
}
