// Constante separada do session.ts (que é server-only) para o middleware Edge
// poder importar sem puxar next/headers.
export const SESSION_COOKIE_NAME = "cc_session";
