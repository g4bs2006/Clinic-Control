// Endpoints administrativos da Helena — exigem o token MASTER da conta
// parceira (env HELENA_MASTER_TOKEN), diferente dos tokens por clínica.
// Docs: Core - Helena/Contas (criar.md, criar_token.md).

const ADMIN_BASE = "https://api.helena.run";

type Opts = { fetchImpl?: typeof fetch; baseUrl?: string };

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
    throw new Error(`Helena API ${res.status}${text ? `: ${text.slice(0, 600)}` : ""}`);
  }
  return res.json();
}

export interface CreateCompanyInput {
  name: string;
  legalName?: string | null;
  documentId?: string | null; // só dígitos
  owner?: { name?: string | null; email?: string | null; phoneNumber?: string | null };
  city?: string | null;
  state?: string | null;
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

  const address: Record<string, string> = {};
  if (input.city) address.city = input.city;
  if (input.state) address.state = input.state;
  if (input.city || input.state) address.country = "Brasil";

  const body: Record<string, unknown> = { name: input.name, status: "ONBOARDING" };
  if (input.legalName) body.legalName = input.legalName;
  if (documentId) {
    body.documentId = documentId;
    body.documentType = documentId.length === 14 ? "CNPJ" : "CPF";
  }
  if (Object.keys(owner).length > 0) body.owner = owner;
  if (Object.keys(address).length > 0) body.address = address;

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
