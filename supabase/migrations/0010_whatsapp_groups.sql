-- Coleta diaria (18h) das mensagens dos grupos de WhatsApp via Evolution + n8n.
-- Principio: o n8n grava mensagens CRUS; o app calcula o tempo de resposta.
-- Metrica alvo: tempo ate um HUMANO da equipe responder no grupo (bot ignorado).

-- Grupos descobertos pela coleta; clinic_id mapeado manualmente para a clinica dona.
create table if not exists whatsapp_groups (
  group_jid  text primary key,
  clinic_id  uuid references clinics(id) on delete set null,
  name       text,
  instance   text,
  updated_at timestamptz not null default now()
);

-- Mensagens crus dos grupos (1 linha por mensagem).
create table if not exists whatsapp_group_messages (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid references clinics(id) on delete set null,
  instance     text,
  group_jid    text not null,
  message_id   text not null,
  from_me      boolean not null default false,  -- true = conta do bot (a instancia)
  participant  text,                            -- numero de quem enviou (sem @...)
  push_name    text,
  message_type text,
  event_ts     timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (group_jid, message_id)                -- idempotencia da coleta
);
create index if not exists wgm_group_ts_idx  on whatsapp_group_messages (group_jid, event_ts);
create index if not exists wgm_clinic_ts_idx on whatsapp_group_messages (clinic_id, event_ts);

-- Numeros da equipe: separam "equipe" (para o relogio) de "cliente".
-- clinic_id null = numero global (equipe Contact.IA que atende varias clinicas).
create table if not exists whatsapp_team_members (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,   -- so digitos, sem @s.whatsapp.net
  name       text,
  clinic_id  uuid references clinics(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists wtm_phone_clinic_idx
  on whatsapp_team_members (phone, coalesce(clinic_id::text, ''));

-- RLS: equipe interna autenticada tem acesso total; anon bloqueado.
-- (o service_role usado pelo n8n ignora RLS.)
do $$
declare t text;
begin
  foreach t in array array['whatsapp_groups','whatsapp_group_messages','whatsapp_team_members'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop policy if exists %I_auth_all on %I', t, t);
    execute format('create policy %I_auth_all on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
