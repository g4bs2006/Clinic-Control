import { z } from "zod";

/**
 * Validação das anotações e detalhes da clínica. Limites frouxos de propósito —
 * é campo de contexto humano, não formulário estruturado; o que importa é
 * barrar vazio e barrar tamanho absurdo (o corpo vai para a tela inteira).
 */
export const clinicNoteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escreva algo na anotação")
    .max(5000, "Anotação muito longa (máximo 5000 caracteres)"),
  is_private: z.boolean().default(false),
});

export type ClinicNoteInput = z.infer<typeof clinicNoteInputSchema>;

/**
 * `label` curto porque é rótulo de ficha, não frase — 60 caracteres já
 * comportam "Melhor horário para falar com o dono". `value` aceita vazio: o
 * campo existir com valor em branco é informação ("perguntamos, não sabem").
 */
export const clinicDetailInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Dê um nome ao campo")
    .max(60, "Nome do campo muito longo (máximo 60 caracteres)"),
  value: z.string().trim().max(2000, "Valor muito longo (máximo 2000 caracteres)").default(""),
});

export type ClinicDetailInput = z.infer<typeof clinicDetailInputSchema>;
