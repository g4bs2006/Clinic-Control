-- collect-groups estava varrendo até MAX_PAGES (40) páginas de TODAS as
-- ~80 grupos em TODA execução do cron (a cada 6h), porque a ordenação do
-- findMessages da Evolution não é cronológica confiável (só por bloco de
-- página). Isso era barato quando o histórico de cada grupo cabia em ~40
-- páginas; com o crescimento do histórico, cada execução passou a levar
-- mais de 120s (timeout do pg_net) e a função começou a dar 504 em toda
-- chamada desde 2026-08-10 — sem sincronizar mensagem nova desde então, o
-- que também parou os resumos diários e a geração de tarefas por IA (que
-- dependem de mensagens frescas).
--
-- Fix: checkpoint por grupo (`last_synced_page`). Cada execução busca só as
-- páginas novas desde o checkpoint (+ overlap de 2 páginas, pro caso da
-- última página ainda estar "abrindo" entre uma execução e outra), em vez
-- de rebuscar do zero. Bootstrap em 38 (= MAX_PAGES atual - overlap) pros
-- grupos existentes, já que essas páginas já foram varridas nas execuções
-- anteriores — evita repetir o escaneamento caro na primeira corrida após
-- o deploy.
set search_path to clinic_control, public;

alter table whatsapp_groups
  add column if not exists last_synced_page integer not null default 0;

update whatsapp_groups
set last_synced_page = 38
where last_synced_page = 0;
