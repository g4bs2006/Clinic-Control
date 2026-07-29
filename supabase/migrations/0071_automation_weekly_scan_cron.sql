-- Varredura SEMANAL da automação de agendamento (segunda, 07h BRT = 10h UTC).
--
-- Diferente do notify_task_due, isto NÃO pode ser uma função SQL: a varredura
-- precisa falar com a API da Helena e decifrar o token de cada clínica, e a
-- chave AES vive no ambiente do app. Então o cron só dá o gatilho HTTP em
-- /api/automacao/scan (pg_cron + pg_net), no mesmo desenho dos crons que
-- chamam as Edge Functions de coleta.
--
-- Por que semanal: o que quebra a automação em silêncio é a clínica renomear uma
-- coluna ou apagar uma etiqueta na Helena. Isso é raro e não precisa de vigília
-- diária — mas hoje só se descobre quando alguém reclama que parou de agendar.
set search_path to clinic_control, public;

-- A URL do app fica no Vault para poder trocar no corte Vercel → VPS sem uma
-- migration nova. Só cria se ainda não existir (não sobrescreve valor ajustado).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'app_base_url') then
    perform vault.create_secret(
      'https://clinic.control.contactia.com.br',
      'app_base_url',
      'Base URL do Clinic Control usada pelos crons que chamam a própria app'
    );
  end if;
end $$;

do $$
begin
  perform cron.unschedule('automation-weekly-scan');
exception when others then null;  -- ainda não existe
end $$;

-- Só agenda se o segredo do cron existir no Vault — sem ele a chamada voltaria
-- 401 toda semana e ninguém veria. Falhar aqui, visível, é melhor.
do $$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'collect_groups_cron_secret') then
    perform cron.schedule(
      'automation-weekly-scan',
      '0 10 * * 1',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
               || '/api/automacao/scan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_groups_cron_secret')
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  else
    raise warning 'automation-weekly-scan NÃO agendado: falta o secret collect_groups_cron_secret no Vault';
  end if;
end $$;

-- Diagnóstico (a lição do notify de grupo): o resultado da chamada aparece em
--   select * from net._http_response order by created desc limit 5;
-- e o histórico do job em
--   select * from cron.job_run_details where jobname = 'automation-weekly-scan' order by start_time desc;
