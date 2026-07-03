import { z } from "zod";

export const clinicInputSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2, "Use a UF com 2 letras").optional(),
  mode: z.enum(["auto", "manual"]).default("manual"),
  contract_status: z.enum(["active", "suspended", "archived"]).default("active"),
  system: z.string().optional(),
  // Dados do dono/documento — usados no provisionamento automático da Helena.
  owner_name: z.string().optional(),
  owner_email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  owner_phone: z.string().optional(),
  legal_name: z.string().optional(),
  document_id: z.string().optional(),
});

export type ClinicInput = z.infer<typeof clinicInputSchema>;

export type Clinic = ClinicInput & {
  id: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};
