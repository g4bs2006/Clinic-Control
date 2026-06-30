"use server"

import { createClient } from "@/lib/supabase/server"
import {
  CLINIC_FILES_BUCKET,
  listAllFiles,
  type StoredFile,
} from "@/lib/storage/clinic-files"

export async function listClinicFiles(clinicId: string): Promise<StoredFile[]> {
  const supabase = await createClient()
  try {
    return await listAllFiles(supabase, clinicId)
  } catch {
    return []
  }
}

// Exclui um arquivo do repositório da clínica. `path` é relativo à clínica.
export async function deleteClinicFile(
  clinicId: string,
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Não autenticado" }

  // Garante que o caminho está dentro da clínica (evita apagar fora do escopo).
  const fullPath = `${clinicId}/${path}`.replace(/\/{2,}/g, "/")
  if (!fullPath.startsWith(`${clinicId}/`)) {
    return { ok: false, error: "Caminho inválido" }
  }

  const { error } = await supabase.storage
    .from(CLINIC_FILES_BUCKET)
    .remove([fullPath])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
