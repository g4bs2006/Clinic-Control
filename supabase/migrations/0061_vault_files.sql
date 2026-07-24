-- Arquivos do cofre: além de credenciais (0050), o cofre passa a guardar
-- arquivos e pastas importantes da operação (contratos, docs de acesso,
-- planilhas-mestre, etc.). Diferente do repositório por clínica (bucket
-- clinic-files, 0006), este é GLOBAL e vive dentro de /cofre.
--
-- Modelo de segurança (decisão 2026-07-23): bucket PRIVADO + URLs assinadas de
-- curta duração + auditoria de download — mesmo padrão do clinic-files, mas com
-- o recorte por papel do cofre. Arquivo NÃO é cifrado no blob (grande/binário);
-- a proteção é o acesso controlado (Supabase) + assinatura + log. Recorte por
-- papel espelha credential_vault: por padrão só gestor vê; abrir para a equipe
-- (visible_to_devs) é decisão explícita, marcável por ARQUIVO ou por PASTA
-- (herança por prefixo de caminho — marcar a pasta compartilha o que há dentro).
set search_path to clinic_control, public;

-- Bucket privado. Caminho da chave = caminho relativo livre ("Pasta/Sub/arquivo.pdf").
-- Como o app perdeu o Supabase Auth, o Storage é acessado via service_role
-- (Server Actions) — estas policies são defensivas/documentais.
insert into storage.buckets (id, name, public)
values ('vault-files', 'vault-files', false)
on conflict (id) do nothing;

create policy "vault-files authenticated select" on storage.objects
  for select to authenticated using (bucket_id = 'vault-files');

create policy "vault-files authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'vault-files');

create policy "vault-files authenticated update" on storage.objects
  for update to authenticated using (bucket_id = 'vault-files')
  with check (bucket_id = 'vault-files');

create policy "vault-files authenticated delete" on storage.objects
  for delete to authenticated using (bucket_id = 'vault-files');

-- Metadados indexados pelo CAMINHO (relativo), servindo tanto arquivo quanto
-- pasta — pasta não é entidade no Storage, então visibilidade e nota moram aqui.
-- Um arquivo é visível para a equipe se o próprio caminho OU um caminho de
-- pasta ancestral estiver marcado visible_to_devs (resolvido no servidor).
create table vault_file_meta (
  path text primary key,                 -- caminho relativo normalizado (sem barra inicial)
  visible_to_devs boolean not null default false,
  note text,
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vault_file_meta_updated_at before update on vault_file_meta
  for each row execute function set_updated_at();

-- Auditoria de download (a ação sensível — quem baixou qual arquivo e quando).
create table vault_file_access_log (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  user_id uuid references app_users(id) on delete set null,
  action text not null default 'download',
  created_at timestamptz not null default now()
);

create index vault_file_access_log_path_idx on vault_file_access_log(path);

alter table vault_file_meta enable row level security;
revoke all on vault_file_meta from anon;
revoke all on vault_file_meta from authenticated;

alter table vault_file_access_log enable row level security;
revoke all on vault_file_access_log from anon;
revoke all on vault_file_access_log from authenticated;
-- Sem policy para anon/authenticated => acesso negado por padrão.
-- O service_role (usado só pelas Server Actions no backend) ignora RLS.
