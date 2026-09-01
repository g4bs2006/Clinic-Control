// Aba "Integrações" — tokens de API pessoais para ferramentas externas (ex.:
// Agents Planner). Cada usuário só vê/gerencia os próprios tokens; um token
// sempre escopa à carteira do dono (ver src/lib/tokens/verify.ts).
import { listMyApiTokens } from "@/lib/tokens/actions"
import { Panel } from "@/components/dashboard/panel"
import { ApiTokensEditor } from "@/components/settings/api-tokens-editor"

export const dynamic = "force-dynamic"

export default async function ConfiguracoesIntegracoesPage() {
  const tokens = await listMyApiTokens()

  return (
    <Panel
      title="Tokens de API"
      subtitle="para ferramentas externas (ex.: Agents Planner) lerem suas tarefas e a atividade das suas clínicas — nunca a carteira de outro dev"
    >
      <ApiTokensEditor initialTokens={tokens} />
    </Panel>
  )
}
