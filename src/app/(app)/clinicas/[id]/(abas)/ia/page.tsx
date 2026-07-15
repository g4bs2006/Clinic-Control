// Aba "IA & Custos" — consumo OpenAI da clínica (custo estimado calibrado),
// vínculo da API key, investigação de contatos e agentes de IA.
import { notFound } from "next/navigation"
import { getClinic } from "@/lib/clinics/actions"
import { monthKey, prevMonth } from "@/lib/snapshots/month"
import { Panel } from "@/components/dashboard/panel"
import { listClinicAgents } from "@/lib/agents/actions"
import { ClinicAgents } from "@/components/clinics/clinic-agents"
import { getClinicOpenAiUsage, listOpenAiKeys } from "@/lib/openai-usage/actions"
import { ClinicOpenAiUsagePanel } from "@/components/clinics/clinic-openai-usage"
import { ClinicOpenAiKeySelect } from "@/components/clinics/clinic-openai-key-select"
import { InvestigateContacts } from "@/components/clinics/investigate-contacts"
import { LazyMount } from "@/components/ui/lazy-mount"
import { monthLabel, lastNMonths } from "../shared"

export const dynamic = "force-dynamic"
// "Investigar contatos" varre conversas da Helena sob demanda — precisa de
// mais que os ~15s padrão de server action no Vercel.
export const maxDuration = 60

export default async function ClinicIaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const clinic = await getClinic(id)
  if (!clinic) notFound()

  const currentMonth = monthKey(new Date())
  const [openAiUsage, openAiKeys, agents] = await Promise.all([
    getClinicOpenAiUsage(id),
    listOpenAiKeys(),
    listClinicAgents(id),
  ])

  return (
    <>
      {/* ── Consumo de IA (OpenAI) ─────────────────────────────── */}
      <Panel
        title="Consumo de IA (OpenAI)"
        subtitle="tokens da API key da clínica · custo estimado rateado da fatura real da organização · coletado diariamente"
      >
        {openAiUsage.ok && openAiUsage.linked ? (
          <LazyMount minHeight={560} rootMargin="400px">
            <ClinicOpenAiUsagePanel
              clinicId={id}
              monthOptions={lastNMonths(currentMonth, 4, prevMonth).map((k) => ({ key: k, label: monthLabel(k) }))}
              initialMonth={currentMonth}
              initial={openAiUsage}
            />
          </LazyMount>
        ) : (
          <p className="text-sm text-muted-foreground">
            {openAiUsage.ok
              ? "Vincule abaixo a API key OpenAI desta clínica para acompanhar tokens, custo diário e receber alertas de gasto anormal."
              : `Não foi possível ler o consumo agora (${openAiUsage.error}).`}
          </p>
        )}
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-3">
          <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            API key OpenAI vinculada
          </span>
          <ClinicOpenAiKeySelect
            clinicId={id}
            clinicName={clinic.name}
            current={clinic.openai_api_key_id ?? null}
            keys={openAiKeys}
          />
        </div>
        <InvestigateContacts clinicId={id} />
      </Panel>

      {/* ── Agentes de IA ──────────────────────────────────────── */}
      <Panel
        title="Agentes de IA"
        subtitle="persona e estágios · editáveis (importados da pasta da clínica)"
      >
        <ClinicAgents agents={agents} />
      </Panel>
    </>
  )
}
