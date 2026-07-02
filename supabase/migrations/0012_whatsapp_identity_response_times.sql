-- Identidade nos grupos + motor do tempo de resposta.
--
-- Descoberta (2026-07-01/02): o find-messages da Evolution identifica o remetente
-- por um id @lid NUMERICO no campo pushName (ex.: 249830328770713), NAO por telefone.
-- O mesmo @lid as vezes chega com o nome real (ex.: "Gabriel contactia"), o que
-- permite reconciliar. A conta conectada aparece como participant='Você' (from_me).
-- Logo: equipe e bot sao cadastrados pelo LID em whatsapp_team_members.

-- lid: id @lid do participante (como aparece em whatsapp_group_messages.participant).
alter table whatsapp_team_members add column if not exists lid text;
-- kind: 'human' conta no relogio de resposta; 'bot' e ignorado no calculo.
alter table whatsapp_team_members add column if not exists kind text not null default 'human';
do $$ begin
  alter table whatsapp_team_members
    add constraint wtm_kind_check check (kind in ('human','bot'));
exception when duplicate_object then null; end $$;
create unique index if not exists wtm_lid_idx
  on whatsapp_team_members (lid) where lid is not null;
-- phone vira opcional: nem todo membro tem telefone conhecido (so o lid).
alter table whatsapp_team_members alter column phone drop not null;

-- Episodios de resposta: um episodio comeca na 1a msg de cliente apos a ultima
-- msg da equipe e fecha na proxima msg de um HUMANO da equipe no grupo.
-- Mensagens do bot sao descartadas; msgs da propria conta conectada ('Você'/from_me)
-- contam como equipe. Episodio sem team_reply_ts = cliente ainda sem resposta.
create or replace view whatsapp_response_times
with (security_invoker = true) as
with team as (
  select lid from whatsapp_team_members where lid is not null and kind = 'human'
),
bot as (
  select lid from whatsapp_team_members where lid is not null and kind = 'bot'
),
msgs as (
  select g.clinic_id, m.group_jid, m.event_ts,
         (m.from_me
          or m.participant = 'Você'
          or m.participant in (select lid from team)) as is_team
  from whatsapp_group_messages m
  join whatsapp_groups g on g.group_jid = m.group_jid
  where g.clinic_id is not null
    and coalesce(m.participant, '') not in (select lid from bot)
),
episodes as (
  select clinic_id, group_jid, event_ts, is_team,
         count(*) filter (where is_team) over (
           partition by group_jid
           order by event_ts
           rows between unbounded preceding and 1 preceding
         ) as episode
  from msgs
)
select clinic_id,
       group_jid,
       episode,
       min(event_ts) filter (where not is_team) as first_client_ts,
       min(event_ts) filter (where is_team)     as team_reply_ts,
       count(*)      filter (where not is_team) as client_msgs
from episodes
group by clinic_id, group_jid, episode
having count(*) filter (where not is_team) > 0;

grant select on whatsapp_response_times to authenticated;
revoke all on whatsapp_response_times from anon;

-- Estatisticas prontas por clinica/mes (mes no fuso de Sao Paulo).
-- A mediana e a metrica destacada: a media e inflada por episodios que
-- atravessam a madrugada/fim de semana.
create or replace view whatsapp_response_stats
with (security_invoker = true) as
select clinic_id,
       to_char(first_client_ts at time zone 'America/Sao_Paulo', 'YYYY-MM') as year_month,
       count(*)::int                                as episodes,
       count(team_reply_ts)::int                    as answered,
       (count(*) - count(team_reply_ts))::int       as unanswered,
       avg(extract(epoch from (team_reply_ts - first_client_ts)))
         filter (where team_reply_ts is not null)   as avg_seconds,
       percentile_cont(0.5) within group
         (order by extract(epoch from (team_reply_ts - first_client_ts)))
         filter (where team_reply_ts is not null)   as median_seconds
from whatsapp_response_times
group by clinic_id, 2;

grant select on whatsapp_response_stats to authenticated;
revoke all on whatsapp_response_stats from anon;
