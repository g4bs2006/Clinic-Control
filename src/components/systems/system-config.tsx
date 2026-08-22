// Conteúdo de configuração de UM sistema em UMA clínica — ADR 0007.
//
// Server component compartilhado pelas duas formas de acesso: o modal sobre a
// matriz (rota interceptada) e a página cheia (link direto ou F5). Uma
// implementação só, porque duas divergiriam — o mesmo raciocínio que fez a
// derivação de estado virar módulo puro.
//
// A CONFIGURAÇÃO MORA AQUI, não na aba Cadastro. A aba tinha 7 painéis e crescia
// a cada sistema novo; ela volta a ser sobre a clínica (ficha, detalhes,
// anotações, arquivos) e mostra apenas QUAIS sistemas estão ligados.
//
// Automação fica de fora desta rodada de propósito: são 568 linhas com chamadas
// à Helena e é o item de maior risco de regressão. Ela continua em
// /clinicas/[id]/editar, e este painel diz onde encontrá-la em vez de deixar o
// usuário procurar.
import Link from "next/link";
import { ExternalLink, ArrowRight } from "lucide-react";
import { getAniversariantesSetup } from "@/lib/clinics/aniversariantes-actions";
import { getDashboardDiagnostics } from "@/lib/systems/access-test";
import { listProvisioning } from "@/lib/clinics/provision-actions";
import { ClinicAniversariantes } from "@/components/clinics/clinic-aniversariantes";
import { ClinicProvisioning } from "@/components/clinics/clinic-provisioning";
import { AccessTestButton } from "@/components/systems/access-test-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SYSTEM_LABELS, type SystemKey } from "@/lib/systems/types";

export const SYSTEM_SLUGS = ["aniversariantes", "helena", "dashboard", "automacao"] as const;
export type SystemSlug = (typeof SYSTEM_SLUGS)[number];

export function isSystemSlug(v: string): v is SystemSlug {
  return (SYSTEM_SLUGS as readonly string[]).includes(v);
}

export function systemTitle(slug: SystemSlug): string {
  return SYSTEM_LABELS[slug as SystemKey];
}

export async function SystemConfig({
  clinicId,
  clinicName,
  clinicSystem,
  slug,
}: {
  clinicId: string;
  clinicName: string;
  clinicSystem: string | null;
  slug: SystemSlug;
}) {
  if (slug === "aniversariantes") {
    const setup = await getAniversariantesSetup(clinicId, clinicSystem);
    return (
      <div className="flex flex-col gap-5">
        <ClinicAniversariantes clinicId={clinicId} clinicName={clinicName} setup={setup} />
        <Section
          title="Teste de redirecionamento"
          hint="assina um link aqui, segue o redirect e confere o escopo do outro lado · não altera nada"
        >
          <AccessTestButton clinicId={clinicId} sistema="aniversariantes" />
        </Section>
      </div>
    );
  }

  if (slug === "helena") {
    const provisioning = await listProvisioning(clinicId);
    return (
      <div className="flex flex-col gap-5">
        {provisioning.length > 0 ? (
          <ClinicProvisioning clinicId={clinicId} rows={provisioning} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum provisionamento registrado para esta clínica.
          </p>
        )}
        <Section
          title="Conta, tokens e webhooks"
          hint="a visão por conta vive em Contas Helena, onde dá para sincronizar e inspecionar webhook"
        >
          <Link
            href="/helena"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
          >
            Abrir Contas Helena
            <ArrowRight className="size-3.5" />
          </Link>
        </Section>
      </div>
    );
  }

  if (slug === "dashboard") {
    const res = await getDashboardDiagnostics(clinicId);
    return (
      <div className="flex flex-col gap-5">
        {!res.ok ? (
          <p className="text-sm text-destructive">{res.error}</p>
        ) : !res.diag.exists ? (
          <p className="text-sm text-muted-foreground">
            Esta clínica ainda não tem dashboard. A criação acontece no <code>/setup</code> do
            DashBoard-s — trazer esse wizard para cá é a issue #70.
          </p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Diag label="Funil" ok={res.diag.hasFunnel}
              detail={res.diag.hasFunnel ? "configurado" : "AUSENTE — a tela do cliente mostra funil vazio"} />
            <Diag label="Dimensões" ok={res.diag.hasDims} detail={res.diag.hasDims ? "configuradas" : "ausentes"} />
            <Diag label="Extração" ok={res.diag.hasExtract} detail={res.diag.hasExtract ? "configurada" : "ausente"} />
            <dt className="text-muted-foreground">Unidades Clinicorp</dt>
            <dd className="tabular-nums">{res.diag.clinicorpUnits || "—"}</dd>
            <dt className="text-muted-foreground">Cards ingeridos</dt>
            <dd className="tabular-nums">
              {res.diag.cards.toLocaleString("pt-BR")}
              {res.diag.lastCardAt && (
                <span className="text-muted-foreground">
                  {" "}· último em {new Date(res.diag.lastCardAt).toLocaleString("pt-BR")}
                </span>
              )}
            </dd>
          </dl>
        )}

        <Section
          title="Teste de redirecionamento"
          hint="abre o dashboard desta clínica por ?clinic=<slug> e reporta o que respondeu"
        >
          <AccessTestButton clinicId={clinicId} sistema="dashboard" />
        </Section>

        <p className="text-xs text-amber-400">
          Esta tela lê, não escreve. O wizard de configuração segue no DashBoard-s até a #70
          portá-lo — meio porte deixaria dois escritores de <code>dashboards.clinics</code>.
        </p>
      </div>
    );
  }

  // Automação — próxima rodada.
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        A configuração da automação ainda não mudou de casa: ela consulta a Helena sob demanda e
        é a de maior risco de regressão, então fica para a rodada seguinte.
      </p>
      <Link
        href={`/clinicas/${clinicId}/editar`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
      >
        Configurar em Editar clínica
        <ExternalLink className="size-3.5" />
      </Link>
      <p className="text-xs text-muted-foreground">
        O panorama da carteira continua em <code>/configuracoes/automacao</code>.
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Diag({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={ok ? "" : "text-amber-400"}>{detail}</dd>
    </>
  );
}
