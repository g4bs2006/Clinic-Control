// Aba "WhatsApp" — mapeamento grupo → clínica e equipe/bot nos grupos.
import { listClinics } from "@/lib/clinics/actions"
import { listWhatsappGroups, listTeamMembers } from "@/lib/whatsapp/actions"
import { Panel } from "@/components/dashboard/panel"
import { WhatsappGroupsEditor } from "@/components/settings/whatsapp-groups-editor"
import { WhatsappTeamEditor } from "@/components/settings/whatsapp-team-editor"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesWhatsappPage() {
  const [groups, teamMembers, clinics] = await Promise.all([
    listWhatsappGroups(),
    listTeamMembers(),
    listClinics(),
  ])

  return (
    <>
      <Panel
        title="Grupos de WhatsApp"
        subtitle="mapeie cada grupo coletado à clínica dona — base do tempo de resposta"
      >
        <WhatsappGroupsEditor
          groups={groups}
          clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
        />
      </Panel>

      <Panel
        title="Equipe no WhatsApp"
        subtitle="quem conta como resposta humana nos grupos (e quais IDs são bot)"
      >
        <WhatsappTeamEditor initialMembers={teamMembers} />
      </Panel>
    </>
  )
}
