// Aba "WhatsApp" — mapeamento grupo → clínica e equipe/bot nos grupos.
import { listClinics } from "@/lib/clinics/actions"
import { listWhatsappGroups, listTeamMembers, getNotifyDeliveryStatus } from "@/lib/whatsapp/actions"
import { getCurrentProfile } from "@/lib/users/actions"
import { Panel } from "@/components/dashboard/panel"
import { WhatsappGroupsEditor } from "@/components/settings/whatsapp-groups-editor"
import { WhatsappTeamEditor } from "@/components/settings/whatsapp-team-editor"
import { NotifyDeliveriesPanel } from "@/components/settings/notify-deliveries-panel"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesWhatsappPage() {
  const [groups, teamMembers, clinics, currentProfile, deliveries] = await Promise.all([
    listWhatsappGroups(),
    listTeamMembers(),
    listClinics(),
    getCurrentProfile(),
    getNotifyDeliveryStatus(),
  ])
  const readOnly = currentProfile?.role !== "gestor"

  return (
    <>
      <Panel
        title="Entrega dos relatórios ao grupo"
        subtitle="histórico dos avisos de manhã, noite e contenção — falha de envio não aparece em lugar nenhum além daqui"
      >
        <NotifyDeliveriesPanel status={deliveries} />
      </Panel>

      <Panel
        title="Grupos de WhatsApp"
        subtitle="mapeie cada grupo coletado à clínica dona — base do tempo de resposta"
      >
        <WhatsappGroupsEditor
          groups={groups}
          clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
          readOnly={readOnly}
        />
      </Panel>

      <Panel
        title="Equipe no WhatsApp"
        subtitle="quem conta como resposta humana nos grupos (e quais IDs são bot)"
      >
        <WhatsappTeamEditor initialMembers={teamMembers} readOnly={readOnly} />
      </Panel>
    </>
  )
}
