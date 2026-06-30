-- Bucket de arquivos por clínica (privado). Caminho: <clinic_id>/<path relativo>.
-- Acesso só por usuários autenticados (equipe interna) via RLS em storage.objects.

insert into storage.buckets (id, name, public)
values ('clinic-files', 'clinic-files', false)
on conflict (id) do nothing;

create policy "clinic-files authenticated select" on storage.objects
  for select to authenticated using (bucket_id = 'clinic-files');

create policy "clinic-files authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'clinic-files');

create policy "clinic-files authenticated update" on storage.objects
  for update to authenticated using (bucket_id = 'clinic-files')
  with check (bucket_id = 'clinic-files');

create policy "clinic-files authenticated delete" on storage.objects
  for delete to authenticated using (bucket_id = 'clinic-files');
