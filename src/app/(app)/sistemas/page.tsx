// Página "Sistemas" — ADR 0007.
//
// Existe porque o que não tem visão de carteira não é operado: o Aniversariantes
// tinha 2 de 30 clínicas configuradas, não por falta de dado (o formulário abre
// pré-preenchido) mas porque descobrir quais eram elegíveis exigiria abrir 61
// abas Cadastro.
//
// Separação com /configuracoes, que é a página vizinha e parecida:
//   /configuracoes  → regras da plataforma (equipe, funil, IA, tarefas)
//   /sistemas       → estado de integração da carteira
//
// Shell no padrão das outras páginas de topo (/helena, /acompanhamentos):
// `main` com `p-4 space-y-6 sm:p-6`, largura `max-w-screen-2xl` porque a matriz
// é larga, e h1 com `brand-header` — o gradiente de marca aplicado ao texto.
import { listSystemsMatrix } from "@/lib/systems/actions";
import { Panel } from "@/components/dashboard/panel";
import { SystemsMatrix } from "@/components/systems/systems-matrix";

export const dynamic = "force-dynamic";

export default async function SistemasPage() {
  const res = await listSystemsMatrix();

  return (
    <main className="mx-auto max-w-screen-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="brand-header text-2xl font-bold">Sistemas</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          o que cada clínica tem ligado · a linha responde “o que essa clínica tem”, a coluna
          responde “quem falta” · a configuração continua na página de cada sistema
        </p>
      </div>

      {res.ok ? (
        <SystemsMatrix rows={res.rows} />
      ) : (
        <Panel title="Sistemas">
          <p className="text-sm text-destructive">{res.error}</p>
        </Panel>
      )}
    </main>
  );
}
