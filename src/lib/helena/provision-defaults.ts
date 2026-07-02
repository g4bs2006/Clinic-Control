// Padrões do provisionamento automático de clínicas na Helena.

/** Equipes criadas automaticamente em toda clínica nova. */
export const DEFAULT_TEAMS = ["Atendimento Humano", "CRC"] as const;

/**
 * Etiquetas (tags) padrão — criadas via contato-semente (create-on-use).
 * PREENCHER: lista exata definida pelo Gabriel (nomes que os bots usam).
 * Enquanto vazia, a etapa 'tags' é marcada como concluída sem criar nada.
 */
export const DEFAULT_TAGS: string[] = [];

/** Contato-semente que materializa as tags padrão na conta nova. */
export const SEED_CONTACT_NAME = "Contact.IA · Setup";
