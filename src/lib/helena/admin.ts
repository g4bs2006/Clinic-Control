// Endpoints administrativos da Helena — exigem o token MASTER da conta
// parceira (env HELENA_MASTER_TOKEN), diferente dos tokens por clínica.
// Docs: Core - Helena/Contas (criar.md, criar_token.md).
//
// ATENÇÃO (sondado em 2026-07-03, a doc marca tudo como opcional — não é):
// o POST /company exige apps (não-vazio), resourcers, owner (com email E
// telefone), legalName e documentId/documentType; responde 500 genérico
// quando faltam. `address`, se enviado, exige CEP — como não coletamos CEP,
// nunca enviamos endereço.

const ADMIN_BASE = "https://api.helena.run";

type Opts = { fetchImpl?: typeof fetch; baseUrl?: string };

/** Extrai a mensagem legível do envelope de erro da Helena ({key, text}). */
function helenaErrorMessage(status: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as { key?: string; text?: string };
    if (parsed.key || parsed.text) {
      return `Helena API ${status} [${parsed.key ?? "?"}]: ${parsed.text ?? rawBody.slice(0, 300)}`;
    }
  } catch {
    // corpo não-JSON — cai no cru
  }
  return `Helena API ${status}${rawBody ? `: ${rawBody.slice(0, 600)}` : ""}`;
}

async function post(
  token: string,
  path: string,
  body: unknown,
  opts?: Opts,
): Promise<Record<string, unknown>> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const base = opts?.baseUrl ?? ADMIN_BASE;
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(helenaErrorMessage(res.status, text));
  }
  return res.json();
}

export interface CreateCompanyInput {
  name: string;
  legalName?: string | null;
  documentId?: string | null; // só dígitos
  owner?: { name?: string | null; email?: string | null; phoneNumber?: string | null };
  /** Apps habilitados — a API exige pelo menos um. */
  apps: string[];
  /** Recursos avançados (resourcers). */
  resourcers: string[];
  /** Limites de recursos (canais, painéis, usuários…). */
  config?: Record<string, number>;
}

/** Cria a conta (company) da clínica na Helena. Retorna o id da conta. */
export async function createCompany(
  masterToken: string,
  input: CreateCompanyInput,
  opts?: Opts,
): Promise<{ id: string }> {
  // Monta o corpo só com o que tem valor — nulls explícitos derrubam a API (500).
  const documentId = input.documentId?.replace(/\D/g, "") || undefined;
  const owner: Record<string, string> = {};
  if (input.owner?.name) owner.name = input.owner.name;
  if (input.owner?.email) owner.email = input.owner.email;
  if (input.owner?.phoneNumber) owner.phoneNumber = input.owner.phoneNumber;

  const body: Record<string, unknown> = {
    name: input.name,
    status: "ONBOARDING", // sem ele a conta nasce como DEMO
    apps: input.apps,
    resourcers: input.resourcers,
  };
  if (input.legalName) body.legalName = input.legalName;
  if (documentId) {
    body.documentId = documentId;
    body.documentType = documentId.length === 14 ? "CNPJ" : "CPF";
  }
  if (Object.keys(owner).length > 0) body.owner = owner;
  if (input.config && Object.keys(input.config).length > 0) body.config = input.config;

  const data = await post(masterToken, "/core/v1/company", body, opts);
  const id = (data.id ?? (data as { company?: { id?: string } }).company?.id) as string | undefined;
  if (!id) throw new Error("Resposta da Helena sem id da conta criada");
  return { id };
}

/** Gera um token permanente de integração para a conta. Retorna o token. */
export async function createCompanyToken(
  masterToken: string,
  companyId: string,
  name = "Clinic Control",
  opts?: Opts,
): Promise<string> {
  const data = await post(masterToken, `/core/v1/company/${companyId}/tokens`, { name }, opts);
  // o formato exato não está documentado — tenta os campos usuais
  const token = (data.token ?? data.value ?? data.accessToken ?? data.key) as string | undefined;
  if (!token) throw new Error("Resposta da Helena sem o token criado");
  return token;
}
