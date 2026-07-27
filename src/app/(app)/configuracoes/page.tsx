// Aba "Equipe & Conta" (padrão) — usuários da plataforma e a própria senha.
import { listClinics } from "@/lib/clinics/actions"
import { listUserProfiles, getCurrentProfile } from "@/lib/users/actions"
import { listPartnerContacts } from "@/lib/clinics/partner-contacts-actions"
import { Panel } from "@/components/dashboard/panel"
import { UsersEditor } from "@/components/settings/users-editor"
import { PartnerContactsEditor } from "@/components/settings/partner-contacts-editor"
import { ChangePasswordForm } from "@/components/settings/change-password-form"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesEquipePage() {
  const [profiles, currentProfile, clinics, partnerContacts] = await Promise.all([
    listUserProfiles(),
    getCurrentProfile(),
    listClinics(),
    listPartnerContacts(),
  ])

  const clinicCountByDeveloper: Record<string, number> = {}
  for (const c of clinics) {
    if (c.developer_id) {
      clinicCountByDeveloper[c.developer_id] = (clinicCountByDeveloper[c.developer_id] ?? 0) + 1
    }
  }

  return (
    <>
      <Panel
        title="Usuários"
        subtitle={
          currentProfile?.role === "gestor"
            ? "criar, editar e redefinir a senha de outras pessoas da equipe"
            : "a equipe da plataforma (só o gestor pode gerenciar)"
        }
      >
        <UsersEditor
          initialProfiles={profiles}
          clinicCountByDeveloper={clinicCountByDeveloper}
          currentUserId={currentProfile?.id}
          readOnly={currentProfile?.role !== "gestor"}
        />
      </Panel>

      <Panel
        title="Contatos de parceiros"
        subtitle={
          currentProfile?.role === "gestor"
            ? "estrategistas e gestores de tráfego — e-mail e WhatsApp que aparecem no cadastro da clínica"
            : "estrategistas e gestores de tráfego (só o gestor pode editar)"
        }
      >
        <PartnerContactsEditor
          initialContacts={partnerContacts}
          readOnly={currentProfile?.role !== "gestor"}
        />
      </Panel>

      <Panel title="Minha conta" subtitle="trocar a sua própria senha de acesso">
        <ChangePasswordForm />
      </Panel>
    </>
  )
}
