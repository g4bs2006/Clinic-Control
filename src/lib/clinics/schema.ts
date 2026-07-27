import { z } from "zod";

export const clinicInputSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2, "Use a UF com 2 letras").optional(),
  zipcode: z
    .string()
    .regex(/^\d{5}-?\d{3}$/, "CEP inválido — use 8 dígitos")
    .optional()
    .or(z.literal("")),
  mode: z.enum(["auto", "manual"]).default("manual"),
  contract_status: z.enum(["active", "suspended", "archived"]).default("active"),
  system: z.string().optional(),
  // Dados do dono/documento — usados no provisionamento automático da Helena.
  owner_name: z.string().optional(),
  owner_email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  owner_phone: z.string().optional(),
  legal_name: z.string().optional(),
  document_id: z.string().optional(),
  strategists: z.array(z.string()).optional(),
  plan: z.enum(["black", "elite"]).optional(),
  odontoimpact: z.boolean().optional(),
  traffic_manager: z.string().optional(),
});

export type ClinicInput = z.infer<typeof clinicInputSchema>;

export type Clinic = ClinicInput & {
  id: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
  developer_id: string | null; // carteira: usuário responsável pela clínica
  onboarded_at: string | null; // âncora do onboarding (null = em andamento)
  openai_project_id: string | null; // legado (0053) — vínculo atual é por API key
  openai_api_key_id: string | null; // API key da clínica na organização OpenAI (monitor de consumo)
  openai_daily_limit_usd: number | null; // teto de alerta próprio; null = limite global
  created_at: string;
};
