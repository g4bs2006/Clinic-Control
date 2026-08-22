// Aba "Cadastro" — setup e referência (mexe-se raramente): ficha da clínica,
// detalhes livres, anotações da equipe, provisionamento Helena, credenciais de
// formulário, integração e arquivos.
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { getClinic } from "@/lib/clinics/actions"
import { listClinicFiles, listClinicFileNotes } from "@/lib/clinics/files-actions"
import {
  listClinicDetailLabels,
  listClinicDetails,
  listClinicNotes,
} from "@/lib/clinics/notes-actions"
import { ClinicDetailsFields } from "@/components/clinics/clinic-details-fields"
import { ClinicNotes } from "@/components/clinics/clinic-notes"
import { getCurrentProfile } from "@/lib/users/actions"
import { listFormCredentials } from "@/lib/clinics/form-credentials-actions"
import { getClinicHelenaIntegration } from "@/lib/helena/accounts-actions"
import { ClinicHelenaIntegration } from "@/components/clinics/clinic-helena-integration"
import { listUserProfiles } from "@/lib/users/actions"
import { ClinicDeveloperSelect } from "@/components/clinics/clinic-developer-select"
import { listProvisioning } from "@/lib/clinics/provision-actions"
import { ClinicProvisioning } from "@/components/clinics/clinic-provisioning"
import { Panel } from "@/components/dashboard/panel"
import { ClinicFiles } from "@/components/clinics/clinic-files"
import { ClinicSystemSelect } from "@/components/clinics/clinic-system-select"
import { ClinicStrategistSelect } from "@/components/clinics/clinic-strategist-select"
import { ClinicOdontoImpact } from "@/components/clinics/clinic-odontoimpact"
import { ClinicFormCredentials } from "@/components/clinics/clinic-form-credentials"
import { listPartnerContacts } from "@/lib/clinics/partner-contacts-actions"
import { ClinicN8nUrl } from "@/components/clinics/clinic-n8n-url"
import { getClinicSystems } from "@/lib/systems/actions"
import { ClinicSystemsStrip } from "@/components/clinics/clinic-systems-strip"

export const dynamic = "force-dynamic"

// Linha da "Ficha da clínica": rótulo à esquerda, controle de edição à direita
// (empilha no mobile). Reúne os metadados de referência num só lugar.
function FichaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="sm:shrink-0">{children}</div>
    </div>
  )
}

export default async function ClinicCadastroPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const clinic = await getClinic(id)
  if (!clinic) notFound()

  const [
    profiles,
    provisioning,
    formCredentials,
    helenaIntegration,
    files,
    fileNotes,
    partnerContacts,
    systems,
    notes,
    details,
    detailLabels,
    profile,
  ] = await Promise.all([
    listUserProfiles(),
    listProvisioning(id),
    listFormCredentials(id),
    getClinicHelenaIntegration(id),
    listClinicFiles(id),
    listClinicFileNotes(id),
    listPartnerContacts(),
    getClinicSystems(id),
    // `listClinicNotes` já filtra as privadas de outras pessoas no servidor —
    // o cliente nunca recebe o que não pode ver.
    listClinicNotes(id),
    listClinicDetails(id),
    listClinicDetailLabels(),
    getCurrentProfile(),
  ])
  const strategistContacts = partnerContacts.filter((c) => c.role === "strategist")
  const trafficManagerContacts = partnerContacts.filter((c) => c.role === "traffic_manager")

  return (
    <>
      {/* ── Ficha da clínica ───────────────────────────────────── */}
      <Panel title="Ficha da clínica" subtitle="dados de referência do ecossistema · clique num campo para editar">
        <div className="flex flex-col divide-y divide-border/50">
          <FichaRow label="Sistema">
            <ClinicSystemSelect clinicId={id} current={clinic.system ?? null} />
          </FichaRow>
          <FichaRow label="Desenvolvedor responsável">
            <ClinicDeveloperSelect
              clinicId={id}
              current={clinic.developer_id ?? null}
              profiles={profiles}
            />
          </FichaRow>
          <FichaRow label="Estrategista">
            <ClinicStrategistSelect
              clinicId={id}
              current={clinic.strategists ?? []}
              contacts={strategistContacts}
            />
          </FichaRow>
          <FichaRow label="Workflow no n8n">
            <ClinicN8nUrl clinicId={id} current={clinic.n8n_url ?? null} />
          </FichaRow>
          <FichaRow label="OdontoImpact (tráfego pago)">
            <ClinicOdontoImpact
              clinicId={id}
              currentOdontoImpact={clinic.odontoimpact ?? false}
              currentTrafficManager={clinic.traffic_manager ?? null}
              contacts={trafficManagerContacts}
            />
          </FichaRow>
        </div>
      </Panel>

      {/* ── Detalhes da clínica (campos livres) ─────────────────── */}
      {/* Logo depois da Ficha porque é a mesma leitura — "o que esta clínica é" —
          só que com os campos que a gente inventa conforme aparece a necessidade. */}
      <Panel
        title="Detalhes da clínica"
        subtitle="campos livres · o que a Ficha não cobre e a equipe precisa achar rápido"
      >
        <ClinicDetailsFields clinicId={id} details={details} labelSuggestions={detailLabels} />
      </Panel>

      {/* ── Anotações ──────────────────────────────────────────── */}
      {/* Acima de Provisionamento/Arquivos de propósito: contexto que a equipe lê
          toda semana não pode ficar enterrado embaixo de setup que se mexe uma vez. */}
      <Panel
        title="Anotações"
        subtitle="contexto da clínica · cada anotação é da equipe ou só sua"
      >
        <ClinicNotes clinicId={id} notes={notes} viewerId={profile?.id ?? null} />
      </Panel>

      {/* ── Provisionamento Helena ─────────────────────────────── */}
      {provisioning.length > 0 && (
        <Panel
          title="Provisionamento Helena"
          subtitle="conta, token, usuário, equipes e painel criados automaticamente"
        >
          <ClinicProvisioning clinicId={id} rows={provisioning} />
        </Panel>
      )}

      {/* ── Credenciais do Formulário ──────────────────────────── */}
      {(clinic.system === "Google Agenda" || clinic.system === "Clinicorp") && (
        <Panel
          title={clinic.system === "Google Agenda" ? "Agendas (Google Calendar)" : "Credenciais do Formulário (Clinicorp)"}
          subtitle={
            clinic.system === "Google Agenda"
              ? "identificadores das agendas de cada unidade"
              : "dados de integração de cada unidade · clique para copiar"
          }
        >
          <ClinicFormCredentials
            clinicId={id}
            credentials={formCredentials}
            system={clinic.system}
          />
        </Panel>
      )}

      {/* ── Integração Helena (conta, tokens, webhooks, eventos) ── */}
      {helenaIntegration.ok && helenaIntegration.account && (
        <ClinicHelenaIntegration
          account={helenaIntegration.account}
          events={helenaIntegration.events}
        />
      )}

      {/* ── Sistemas desta clínica ─────────────────────────────── */}
      {/* Os painéis de configuração de Automação e Aniversariantes saíram daqui
          (ADR 0007). Esta aba é sobre A CLÍNICA; a configuração dos sistemas
          mora em /sistemas, onde dá para ver a carteira inteira de uma vez —
          era a falta dessa visão que mantinha o Aniversariantes em 2 de 30. */}
      <Panel
        title="Sistemas"
        subtitle="o que esta clínica tem ligado · configurar em Sistemas, onde a carteira inteira aparece junto"
      >
        <ClinicSystemsStrip row={systems.ok ? systems.row : null} />
      </Panel>

      {/* ── Arquivos da clínica ────────────────────────────────── */}
      <Panel
        title="Arquivos da clínica"
        subtitle="suba a pasta · qualquer pessoa da equipe pode baixar"
      >
        <ClinicFiles clinicId={id} files={files} notes={fileNotes} />
      </Panel>
    </>
  )
}
