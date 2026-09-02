-- Fixes the Agents Planner whatsapp-activity integration (500 on every call):
-- `whatsapp_group_messages` had no FK to `whatsapp_groups`, so PostgREST
-- couldn't resolve the `whatsapp_groups!inner(...)` embed used by
-- `src/app/api/integrations/agents-planner/whatsapp-activity/route.ts` —
-- "Could not find a relationship between 'whatsapp_group_messages' and
-- 'whatsapp_groups' in the schema cache". Verified zero orphaned rows before
-- adding the constraint (every `group_jid` in messages already exists in
-- `whatsapp_groups`), so this is additive-only, no data cleanup needed.
set search_path to clinic_control, public;

alter table whatsapp_group_messages
  add constraint whatsapp_group_messages_group_jid_fkey
  foreign key (group_jid) references whatsapp_groups (group_jid);

-- PostgREST caches the relationship graph; force an immediate reload instead
-- of waiting for the next schema-change notification.
notify pgrst, 'reload schema';
