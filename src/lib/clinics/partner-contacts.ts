// Tipos + helpers puros dos contatos de parceiros (estrategistas / gestores de
// tráfego). Sem "use server" — pode ser importado por componentes cliente. As
// server actions ficam em `partner-contacts-actions.ts`.

export type PartnerRole = "strategist" | "traffic_manager";

export type PartnerContact = {
  id: string;
  role: PartnerRole;
  name: string;
  email: string | null;
  phone: string | null;
  position: number;
  active: boolean;
};

/**
 * Monta o link wa.me a partir de um telefone. Tira tudo que não é dígito e, se
 * vier sem DDI (10–11 dígitos = DDD + número), assume Brasil (55). Retorna null
 * quando não há telefone utilizável.
 */
export function waLink(phone: string | null | undefined): string | null {
  const digits = waDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

/**
 * Só os dígitos com DDI, normalizados — a base tanto do link wa.me quanto do
 * `whatsapp://send?phone=` (que abre o app instalado em vez de uma aba do
 * WhatsApp Web) e do "copiar número". Null quando não há telefone utilizável.
 */
export function waDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null; // curto demais para ser um número válido
  if (digits.length <= 11) digits = `55${digits}`;
  return digits;
}
