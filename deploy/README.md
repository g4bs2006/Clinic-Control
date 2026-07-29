# Deploy do Clinic Control na VPS Hostinger — runbook

Substitui a **Vercel** (`contactiacliniccontrol.vercel.app`). O que **não** muda:
Supabase (banco, storage, Edge Functions e todos os crons) e GitHub.

## Arquitetura

A VPS `179.197.235.183` já hospeda o projeto de ligações (stack `contactia`), e é
o **nginx dele** que atende 80/443. O Clinic Control não sobe nginx próprio:
entra como container na rede `contactia_default` e ganha um `server block` novo.

```
                     ┌──────── nginx (stack contactia, 80/443) ────────┐
navegador  ──▶       │  ligacoes.contactia.com.br      → api:3333 + SPA│
                     │  cliniccontrol.contactia.com.br → clinic-control:3000
                     └─────────────────────────────────────────────────┘
                                        │
                                   Supabase (banco, storage, crons)
```

| Domínio | Serve |
|---|---|
| `cliniccontrol.contactia.com.br` | Clinic Control (Next.js) |

⚠️ Não usar `api.` nem `painel.` (outra aplicação, TurboCloud `178.156.203.95`)
nem `ligacoes.`/`ligacoes-api.` (projeto de ligações, mesma VPS).

### O que a Vercel fazia e agora é responsabilidade nossa

- **Deploy contínuo:** não existe mais `git push` → deploy. Use `deploy/deploy.sh`.
- **Alerta de queda:** configurar algo externo (ex.: UptimeRobot) apontando para
  `https://cliniccontrol.contactia.com.br/login`.
- **CDN/edge:** o app passa a ser servido de um único servidor no Brasil. Para
  uso interno, sem impacto relevante.

### O que **não** precisa mudar

Nenhum cron vivia na Vercel — todos são Supabase (pg_cron + Edge Functions):
`notify_task_due`, `collect-groups`, `collect-openai-usage`, `summarize-groups`,
`churn-postmortem`, `health-evolution`. Continuam funcionando sem alteração.

## Arquivos

| Arquivo | O que é |
|---|---|
| `Dockerfile` | build em 3 estágios; imagem final só com `output: standalone` |
| `docker-compose.yml` | serviço `app` na rede externa `contactia_default`, sem publicar portas |
| `deploy/nginx/cliniccontrol-bootstrap.conf` | variante só-HTTP, para emitir o 1º certificado |
| `deploy/nginx/cliniccontrol.conf` | proxy definitivo com HTTPS |
| `deploy/verificar-env.sh` | valida e lista (mascarado) as chaves do `.env` |
| `deploy/deploy.sh` | deploy de uma nova versão |

---

## 1. Coletar as chaves da Vercel (fazer PRIMEIRO)

Quatro variáveis existem **só na Vercel** — não estão no `.env.local`:
`VAULT_ENC_KEY`, `DEEPSEEK_API_KEY`, `FORM_WEBHOOK_SECRET` e, opcionalmente,
`LLM_MODEL` / `LLM_BASE_URL`.

🔴 **`VAULT_ENC_KEY` não pode ser regenerada.** É a chave que decifra as senhas
já salvas no Cofre. Se o app subir sem ela, cai no fallback
(`HELENA_TOKEN_ENC_KEY`) e tudo que foi cifrado com a chave original fica
ilegível.

A conta da CLI (`vercel whoami` → `contactia`, team `contact-ia-s-projects`) **não
enxerga** o projeto do Clinic Control. Duas saídas:

```bash
# a) logar com a conta dona de contactiacliniccontrol.vercel.app
vercel login
vercel link                       # escolher o projeto do Clinic Control
vercel env pull .env.producao --environment production
```

b) ou copiar à mão do Dashboard: *Project → Settings → Environment Variables →
Production*, revelando cada valor.

Confira que a lista bate com `.env.example`.

## 2. Clonar o projeto na VPS

Repositório privado (`g4bs2006/Clinic-Control`) — a VPS acessa por **deploy key**
(somente leitura). O usuário `contactia` já existe e já está no grupo `docker`.

```bash
ssh contactia-app                 # atalho já configurado em ~/.ssh/config

ssh-keygen -t ed25519 -N "" -C "cliniccontrol-vps-deploy" -f ~/.ssh/github_cliniccontrol
cat ~/.ssh/github_cliniccontrol.pub   # cadastrar em Settings > Deploy keys, SEM write access
cat >> ~/.ssh/config <<'EOF'
Host github-cliniccontrol
    HostName github.com
    IdentityFile ~/.ssh/github_cliniccontrol
    IdentitiesOnly yes
EOF

mkdir -p ~/clinic-control && cd ~/clinic-control
git clone git@github-cliniccontrol:g4bs2006/Clinic-Control.git app
cd app
```

> O projeto de ligações já usa `~/.ssh/github_deploy` para o repositório dele —
> por isso a chave nova e o alias `github-cliniccontrol`, senão o GitHub recusa a
> segunda chave ("key already in use").

## 3. Variáveis de ambiente

Um único arquivo, `.env` na raiz (ao lado do `docker-compose.yml`). Ele serve
para **duas** coisas: `env_file` do runtime e interpolação dos build args das
`NEXT_PUBLIC_*` (que são embutidas no bundle em tempo de build).

Transfira do seu computador via `scp`, sem passar por ferramenta externa:

```bash
# no SEU computador, depois de montar o arquivo com os valores do passo 1
scp .env.producao contactia@179.197.235.183:~/clinic-control/app/.env
```

```bash
# na VPS
chmod 600 .env
./deploy/verificar-env.sh          # confere obrigatórias e avisa das opcionais
```

O `.gitignore` cobre `.env*` — nada disso vai para o Git.

## 4. DNS

⚠️ `cliniccontrol.contactia.com.br` **já existe** e aponta para o servidor cPanel
(`107.150.167.163`, devolve 404). É um subdomínio criado e não usado. Não há
wildcard na zona, então é um registro explícito a **editar**, não criar.

O DNS de `contactia.com.br` não é gerenciado no GoDaddy (só registradora). Os
nameservers são `ns1/ns2.brasil126-5173.com.br` → **Zone Editor do cPanel**.

| Nome | Antes | Depois |
|---|---|---|
| `cliniccontrol` (A) | `107.150.167.163` | `179.197.235.183` |

Deixe o registro **TXT/SPF** em paz (é o SPF que o cPanel cria junto; inofensivo).

⚠️ Nunca trocar os nameservers: a mesma zona sustenta o site, o e-mail (MX) e as
aplicações em `api`/`painel`.

Confirme antes de emitir o certificado — pode levar até o TTL para propagar:

```bash
dig +short cliniccontrol.contactia.com.br    # tem que devolver 179.197.235.183
```

## 5. Subir o app (ainda sem HTTPS)

O nginx se recusa a subir apontando para um certificado inexistente — e isso
derrubaria o site de ligações junto. Por isso o bootstrap em HTTP:

```bash
cd ~/clinic-control/app
set -a; . ./.env; set +a
docker compose up -d --build app
docker compose ps                  # clinic-control = Up (healthy)

# server block provisório no nginx da OUTRA stack (conf.d é bind-mount)
cp deploy/nginx/cliniccontrol-bootstrap.conf \
   ~/contactia/app/deploy/nginx/conf.d/cliniccontrol.conf
cd ~/contactia/app
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload

curl -I http://cliniccontrol.contactia.com.br/login    # 200
```

O primeiro build leva alguns minutos (npm ci + `next build` na VPS).

## 6. Certificado SSL

Lineage própria, separada da de ligações, nos mesmos volumes do certbot:

```bash
docker run --rm \
  -v contactia_certbot-www:/var/www/certbot \
  -v contactia_certbot-conf:/etc/letsencrypt \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  --cert-name cliniccontrol.contactia.com.br \
  -d cliniccontrol.contactia.com.br \
  --email gabriel.rodrigues@escalarodonto.com.br \
  --agree-tos --no-eff-email --non-interactive
```

Troque o server block pelo definitivo:

```bash
cd ~/clinic-control/app
cp deploy/nginx/cliniccontrol.conf \
   ~/contactia/app/deploy/nginx/conf.d/cliniccontrol.conf
cd ~/contactia/app
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload

curl -I https://cliniccontrol.contactia.com.br/login    # 200, cadeado válido
```

**Renovação:** nada a fazer. O cron mensal que já existe
(`0 3 1 * * .../renovar-certificado.sh`, usuário `contactia`) roda
`certbot renew`, que renova **todas** as lineages do volume — inclusive esta.

## 7. Validação em paralelo (Vercel continua no ar)

Enquanto a Vercel não for desligada, o `APP_URL` da Edge Function
`collect-openai-usage` continua apontando para lá — é assim que a contenção de
IA é disparada. Não mexa nele ainda.

1. ☐ Login funcionando (cookie `secure` exige o HTTPS do passo 6)
2. ☐ **Cofre** — abrir uma senha antiga e um arquivo: prova que `VAULT_ENC_KEY` veio certa
3. ☐ **Clínicas** — abrir uma clínica: prova que `HELENA_TOKEN_ENC_KEY` veio certa
4. ☐ **Notificações** — o sino conecta em realtime (`SUPABASE_JWT_SECRET`)
5. ☐ **Tarefas → "Gerar da IA"** — o job sai de "na fila" (prova o tick interno + `DEEPSEEK_API_KEY`)
6. ☐ **Relatório de conversas** — gerar um xlsx (job longo, `proxy_read_timeout`)
7. ☐ **Upload** — anexar arquivo numa tarefa (`client_max_body_size`)
8. ☐ `docker compose logs app` sem erro de conexão
9. ☐ Site de ligações **continua** no ar (o reload do nginx é compartilhado)

## 8. Corte

1. ☐ Trocar o secret `APP_URL` da Edge Function `collect-openai-usage` para
      `https://cliniccontrol.contactia.com.br` (Supabase Dashboard → Edge
      Functions → Secrets)
2. ☐ Avisar os usuários do novo endereço
3. ☐ **Pausar** o projeto na Vercel (não excluir — é o rollback)
4. ☐ Acompanhar `docker compose logs -f app` por algumas horas
5. ☐ Depois de alguns dias estáveis: desativar de vez

**Rollback:** reativar a Vercel, voltar o `APP_URL` e usar a URL antiga. O banco é
o mesmo Supabase nos dois lados, então não há divergência de dados.

---

## Operação do dia a dia

```bash
cd ~/clinic-control/app

./deploy/deploy.sh                 # deploy de uma nova versão (git pull + rebuild)
./deploy/verificar-env.sh          # conferir chaves (mascarado)
docker compose logs -f app
docker compose restart app
```

### Notas de operação

- **Rebuild é obrigatório** para qualquer mudança de código **e** para mudança em
  `NEXT_PUBLIC_*` (elas ficam dentro do bundle). Mudança nas outras variáveis
  precisa só de `docker compose up -d app`.
- **Jobs em background** (relatórios, sugestões de IA, contenção) rodam no
  processo do próprio app via `after()` + um tick HTTP para a própria URL
  pública. O `extra_hosts` do compose faz o container resolver
  `cliniccontrol.contactia.com.br` no próprio host, sem sair para a internet.
  Todo endpoint de tick novo precisa entrar em `PUBLIC_PREFIXES` do middleware.
- **Deploy corta job em andamento.** O `stop_grace_period: 30s` dá tempo do
  `after()` terminar, mas job longo (relatório grande) pode morrer no meio — o
  auto-kick do polling recupera. Prefira deployar fora do horário de uso.
- **ufw** está inativo, como no outro projeto. Atenção: o Docker publica portas
  via `DOCKER-USER` no iptables, avaliada **antes** do ufw — regra de bloqueio
  não protege container. Aqui o app não publica porta nenhuma (só `expose`), o
  que já é a proteção: ele só é alcançável pelo nginx, dentro da rede docker.
- **Backup:** nada novo. Todo o estado vive no Supabase; a VPS não guarda dado
  do Clinic Control (o volume `pgdata` da stack `contactia` está ocioso e não é
  usado por este app).
