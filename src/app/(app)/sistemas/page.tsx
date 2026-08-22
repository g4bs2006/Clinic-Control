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
import { listSystemsMatrix } from "@/lib/systems/actions";
import { Panel } from "@/components/dashboard/panel";
import { SystemsMatrix } from "@/components/systems/systems-matrix";

export const dynamic = "force-dynamic";

export default async function SistemasPage() {
  const res = await listSystemsMatrix();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Sistemas</h1>
        <p className="max-w-[62ch] text-sm text-muted-foreground">
          Que sistemas cada clínica tem ligados, e onde falta. A linha responde “o que essa
          clínica tem”; a coluna responde “quem falta”. A configuração continua na página de
          cada sistema — aqui é onde se vê a carteira inteira de uma vez.
        </p>
      </header>

      {res.ok ? (
        <SystemsMatrix rows={res.rows} />
      ) : (
        <Panel title="Sistemas">
          <p className="text-sm text-destructive">{res.error}</p>
        </Panel>
      )}
    </div>
  );
}
