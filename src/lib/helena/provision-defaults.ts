// Padrões do provisionamento automático de clínicas na Helena.

/** Equipes criadas automaticamente em toda clínica nova. */
export const DEFAULT_TEAMS = ["Atendimento Humano", "CRC"] as const;

/**
 * Etiquetas (tags) padrão — criadas via contato-semente (create-on-use).
 * Definida pelo Gabriel em 2026-07-02: a tag que a IA aplica ao agendar.
 */
export const DEFAULT_TAGS: string[] = ["Agendado - Usado pela IA"];

/** Contato-semente que materializa as tags padrão na conta nova. */
export const SEED_CONTACT_NAME = "Contact.IA · Setup";
