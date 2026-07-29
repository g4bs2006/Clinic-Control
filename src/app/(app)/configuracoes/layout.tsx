// Layout das abas de Configurações: header leve + navegação por abas. Cada
// aba é uma sub-rota e busca só os próprios dados — o header persiste na
// troca (mesmo padrão da página da clínica). A aba IA só aparece para gestor
// (a sub-rota também se protege no servidor).
import { getCurrentProfile } from "@/lib/users/actions"
import { ConfigTabs } from "@/components/settings/config-tabs"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()

  return (
    <main className="p-4 space-y-6 sm:p-6 max-w-screen-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold brand-header">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Equipe, IA, tarefas, funil, automação e WhatsApp — tudo que ajusta a plataforma
        </p>
      </div>

      <ConfigTabs isGestor={profile?.role === "gestor"} />

      {children}
    </main>
  )
}
