# 0002 — Hospedar na VPS Hostinger em vez da Vercel

- **Status:** Aceito
- **Data:** 2026-07-29

## Contexto

O Clinic Control rodava na Vercel (`contactiacliniccontrol.vercel.app`), com
auto-deploy do `main`. A empresa já mantinha a VPS `179.197.235.183` (Hostinger)
para o projeto de ligações, com nginx próprio atendendo 80/443.

Houve **duas rodadas de decisão sobre isso, com resultados opostos** — o motivo
deste ADR existir:

1. Primeiro avaliamos migrar para self-host (TurboCloud/VPS) e **decidimos não
   migrar**: estava funcionando bem na Vercel, e a migração não pagava o próprio
   custo.
2. Em 2026-07-29 a migração **foi feita**, aproveitando que a VPS e o nginx já
   existiam para outro projeto — o custo marginal caiu para "um server block e
   um container", não "provisionar e operar um servidor".

## Decisão

O app roda como container na rede `contactia_default` da VPS, servido em
`clinic.control.contactia.com.br` pelo nginx da stack `contactia`. O deploy
contínuo é feito por GitHub Actions (`.github/workflows/deploy-vps.yml`), que
abre um SSH cuja chave tem `command=` forçado no `authorized_keys` — ela só
consegue executar `deploy/deploy.sh`, e ignora qualquer argumento.

O Supabase **não** muda: banco, storage, Edge Functions e todos os crons
(`pg_cron`) seguem lá. Nenhum cron vivia na Vercel.

## Consequências

- **Ganho:** custo previsível, controle do runtime, e reaproveitamento de
  infraestrutura que já era operada.
- **Passou a ser responsabilidade nossa** o que a Vercel dava de graça:
  - *Alerta de queda* — precisa de monitor externo apontando para
    `/login`. Ainda **não configurado**.
  - *CDN/edge* — o app é servido de um único servidor no Brasil. Para uso
    interno, sem impacto relevante.
- **Deploys em série.** `concurrency: cancel-in-progress: false` de propósito:
  dois deploys simultâneos brigariam pelo mesmo container, e matar um no meio
  deixaria a stack indefinida.
- **A host key da VPS está fixada** no workflow. É informação pública, por isso
  mora no arquivo em vez de num secret — mas **não trocar por
  `StrictHostKeyChecking=no`**, que aceitaria qualquer servidor que respondesse
  naquele IP.
- Runbook completo em [`deploy/README.md`](../../deploy/README.md).
