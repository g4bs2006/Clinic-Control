import { describe, it, expect } from "vitest";
import { canEditNote, canViewNote } from "@/lib/clinics/notes";
import { clinicNoteInputSchema, clinicDetailInputSchema } from "@/lib/clinics/notes-schema";

const ANA = "11111111-1111-1111-1111-111111111111";
const BRUNO = "22222222-2222-2222-2222-222222222222";

describe("canViewNote", () => {
  it("compartilhada é visível para qualquer pessoa", () => {
    const note = { author_id: ANA, is_private: false };
    expect(canViewNote(note, BRUNO)).toBe(true);
    expect(canViewNote(note, ANA)).toBe(true);
  });

  it("privada é visível só para quem escreveu", () => {
    const note = { author_id: ANA, is_private: true };
    expect(canViewNote(note, ANA)).toBe(true);
    expect(canViewNote(note, BRUNO)).toBe(false);
  });

  it("privada sem autor (usuário excluído) fica invisível para todos", () => {
    // Não deve casar com viewerId null — senão bastaria não ter sessão para ler.
    const note = { author_id: null, is_private: true };
    expect(canViewNote(note, null)).toBe(false);
    expect(canViewNote(note, ANA)).toBe(false);
  });

  it("compartilhada sem autor sobrevive à exclusão do usuário", () => {
    expect(canViewNote({ author_id: null, is_private: false }, ANA)).toBe(true);
  });

  it("sem sessão enxerga só as compartilhadas", () => {
    expect(canViewNote({ author_id: ANA, is_private: false }, null)).toBe(true);
    expect(canViewNote({ author_id: ANA, is_private: true }, null)).toBe(false);
  });
});

describe("canEditNote", () => {
  it("compartilhada é editável por qualquer pessoa da equipe", () => {
    expect(canEditNote({ author_id: ANA, is_private: false }, BRUNO)).toBe(true);
  });

  it("privada é editável só pelo autor", () => {
    expect(canEditNote({ author_id: ANA, is_private: true }, ANA)).toBe(true);
    expect(canEditNote({ author_id: ANA, is_private: true }, BRUNO)).toBe(false);
  });

  it("sem sessão não edita nada", () => {
    expect(canEditNote({ author_id: ANA, is_private: false }, null)).toBe(false);
    expect(canEditNote({ author_id: null, is_private: false }, null)).toBe(false);
  });
});

describe("clinicNoteInputSchema", () => {
  it("aceita corpo válido e assume compartilhada", () => {
    const r = clinicNoteInputSchema.safeParse({ body: "Dono só responde depois das 18h" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.is_private).toBe(false);
  });

  it("rejeita corpo vazio ou só espaços", () => {
    expect(clinicNoteInputSchema.safeParse({ body: "" }).success).toBe(false);
    expect(clinicNoteInputSchema.safeParse({ body: "   \n  " }).success).toBe(false);
  });

  it("rejeita corpo acima de 5000 caracteres", () => {
    expect(clinicNoteInputSchema.safeParse({ body: "a".repeat(5001) }).success).toBe(false);
    expect(clinicNoteInputSchema.safeParse({ body: "a".repeat(5000) }).success).toBe(true);
  });

  it("apara o corpo", () => {
    const r = clinicNoteInputSchema.safeParse({ body: "  anotação  " });
    expect(r.success && r.data.body).toBe("anotação");
  });
});

describe("clinicDetailInputSchema", () => {
  it("aceita rótulo com valor vazio — campo existir já é informação", () => {
    const r = clinicDetailInputSchema.safeParse({ label: "Senha do wifi" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.value).toBe("");
  });

  it("rejeita rótulo vazio", () => {
    expect(clinicDetailInputSchema.safeParse({ label: "  " }).success).toBe(false);
  });

  it("rejeita rótulo acima de 60 caracteres", () => {
    expect(clinicDetailInputSchema.safeParse({ label: "a".repeat(61) }).success).toBe(false);
  });

  it("rejeita valor acima de 2000 caracteres", () => {
    expect(
      clinicDetailInputSchema.safeParse({ label: "Observação", value: "a".repeat(2001) }).success,
    ).toBe(false);
  });
});
