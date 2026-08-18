# ⚠️ n8n descontinuado

A coleta das mensagens dos grupos foi migrada do n8n para uma **Supabase Edge
Function** (`supabase/functions/collect-groups/`), agendada via Cron do Supabase —
tudo num sistema só, sem depender do n8n.

O arquivo `coleta-grupos-18h.json` fica apenas como **referência histórica** do fluxo.
Não é mais usado.

Ver: `supabase/functions/collect-groups/README.md`.
