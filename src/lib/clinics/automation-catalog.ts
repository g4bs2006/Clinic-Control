import "server-only";
import { getPanelWithSteps, getPanelCustomFields, listContactTags } from "@/lib/helena/client";
import type { AutomationCatalog } from "./automation";

/**
 * Puxa da Helena os quatro catálogos que a configuração da automação usa:
 * etapas e etiquetas de card (ambas vêm do painel), campos personalizados do
 * painel e etiquetas de contato (catálogo da conta).
 *
 * Em paralelo porque são independentes. Um catálogo que falha volta VAZIO em vez
 * de derrubar a tela: o campo correspondente aparece sem opções e a detecção
 * registra "nenhuma candidata" — degradar é melhor que uma tela em branco. O
 * painel em si não tem esse tratamento de propósito: sem ele não há o que
 * configurar, e o erro (token inválido, painel apagado) precisa aparecer.
 */
export async function loadAutomationCatalog(
  token: string,
  panelId: string,
): Promise<AutomationCatalog> {
  const [panel, customFields, contactTags] = await Promise.all([
    getPanelWithSteps(token, panelId),
    getPanelCustomFields(token, panelId).catch(() => []),
    listContactTags(token).catch(() => []),
  ]);
  return {
    steps: panel.steps.map((s) => ({ id: s.id, title: s.title, position: s.position })),
    customFields,
    panelTags: panel.tags,
    contactTags,
  };
}
