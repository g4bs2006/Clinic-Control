// Tipos + helpers puros das anotações e detalhes da clínica. Sem "use server" —
// pode ser importado por componentes cliente e por teste. As server actions
// ficam em `notes-actions.ts`.

export type ClinicNote = {
  id: string;
  clinic_id: string;
  body: string;
  author_id: string | null;
  /** Autor resolvido para exibição — null quando o usuário foi excluído. */
  author_name: string | null;
  is_private: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicDetail = {
  id: string;
  clinic_id: string;
  label: string;
  value: string | null;
  position: number;
};

/** Forma mínima de uma anotação para decidir visibilidade — o que vem do banco. */
export type NoteVisibilityRow = {
  author_id: string | null;
  is_private: boolean;
};

/**
 * A regra de privacidade, em um só lugar: compartilhada é de todos, privada é
 * só de quem escreveu.
 *
 * Existe como função pura porque RLS está desligada no app (o client de banco é
 * service role — ver src/lib/supabase/server.ts): não há rede de segurança no
 * banco, o filtro TEM que ser aplicado em toda leitura e em toda escrita. Um
 * `select` que esqueça isso vaza. Por isso é testável e chamada por nome, em vez
 * de um `.or(...)` repetido em cada query.
 *
 * Nota privada com author_id null (autor excluído) é invisível para todos — o
 * trigger da migration 0078 apaga essas na exclusão do usuário, então isso só
 * cobre resíduo de linha criada antes dele.
 *
 * `viewerId` null (sem sessão) enxerga apenas as compartilhadas.
 */
export function canViewNote(note: NoteVisibilityRow, viewerId: string | null): boolean {
  if (!note.is_private) return true;
  return note.author_id !== null && note.author_id === viewerId;
}

/**
 * Quem pode alterar/apagar. Compartilhada é do time (qualquer pessoa da equipe
 * ajusta — todo usuário autenticado aqui é staff interno); privada é só do
 * autor. Deliberadamente NÃO abre exceção para gestor: "privada" prometeu
 * privada, e um gestor que lê a privada dos outros torna o rótulo mentira.
 */
export function canEditNote(note: NoteVisibilityRow, viewerId: string | null): boolean {
  if (!viewerId) return false;
  if (note.is_private) return note.author_id === viewerId;
  return true;
}
