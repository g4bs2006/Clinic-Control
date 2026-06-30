"use server"

import { createClient } from "@/lib/supabase/server"
import { listAllFiles, type StoredFile } from "@/lib/storage/clinic-files"

export async function listClinicFiles(clinicId: string): Promise<StoredFile[]> {
  const supabase = await createClient()
  try {
    return await listAllFiles(supabase, clinicId)
  } catch {
    return []
  }
}
