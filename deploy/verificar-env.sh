#!/usr/bin/env bash
# Confere o .env de produção antes de subir e lista as chaves mascaradas.
#
#   ./deploy/verificar-env.sh              # mascarado (seguro em tela compartilhada)
#   ./deploy/verificar-env.sh --revelar    # valores completos
#
# Sai com erro se faltar alguma variável obrigatória — o deploy aborta antes de
# gastar um build. As "recomendadas" só desligam funcionalidade, não derrubam
# o app, então viram aviso.
set -euo pipefail

cd "$(dirname "$0")/.."

REVELAR=0
[ "${1:-}" = "--revelar" ] && REVELAR=1

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado na raiz do projeto." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

OBRIGATORIAS=(
  NEXT_PUBLIC_SUPABASE_URL          # público, embutido no bundle em build time
  NEXT_PUBLIC_SUPABASE_ANON_KEY     # público, embutido no bundle em build time
  SUPABASE_SERVICE_ROLE_KEY         # acesso total ao banco
  AUTH_SECRET                       # assina o cookie de sessão — trocar derruba todos os logins
  HELENA_TOKEN_ENC_KEY              # decifra os tokens da Helena no banco — NÃO pode mudar
  SUPABASE_JWT_SECRET               # sem ela o realtime das notificações cai para polling
  HELENA_MASTER_TOKEN               # provisionamento de contas Helena
  COLLECT_GROUPS_CRON_SECRET        # disparo on-demand das Edge Functions
)

# Ausentes não quebram o boot, mas desligam recurso (ou pior, no caso do cofre).
RECOMENDADAS=(
  VAULT_ENC_KEY                     # cofre; sem ela cai no fallback HELENA_TOKEN_ENC_KEY
  DEEPSEEK_API_KEY                  # "Gerar da IA" em /tarefas
  FORM_WEBHOOK_SECRET               # webhook /api/form-credentials
  LLM_MODEL                         # default deepseek-chat
  LLM_BASE_URL                      # default https://api.deepseek.com
)

mascarar() {
  local nome="$1" valor="$2" n=${#2}
  if [ "$n" -eq 0 ]; then
    printf -- "-- ausente --"
  elif [ "$REVELAR" = "1" ] || [[ "$nome" == NEXT_PUBLIC_SUPABASE_URL || "$nome" == LLM_* ]]; then
    printf -- "%s" "$valor"
  elif [ "$n" -gt 14 ]; then
    printf -- "%s...%s  (%s chars)" "${valor:0:6}" "${valor: -4}" "$n"
  else
    printf -- "...oculto...  (%s chars)" "$n"
  fi
}

faltando=0
echo "=============================================="
echo " OBRIGATÓRIAS"
echo "=============================================="
for k in "${OBRIGATORIAS[@]}"; do
  v="${!k:-}"
  printf "  %-30s %s\n" "$k" "$(mascarar "$k" "$v")"
  [ -z "$v" ] && faltando=$((faltando + 1))
done

echo
echo "=============================================="
echo " RECOMENDADAS (ausência desliga recurso)"
echo "=============================================="
for k in "${RECOMENDADAS[@]}"; do
  v="${!k:-}"
  printf "  %-30s %s\n" "$k" "$(mascarar "$k" "$v")"
  if [ -z "$v" ]; then
    echo "      ^ aviso: recurso indisponível (ver comentário em deploy/verificar-env.sh)"
  fi
done

echo
if [ "$faltando" -gt 0 ]; then
  echo "ERRO: $faltando variável(is) obrigatória(s) faltando — deploy abortado." >&2
  exit 1
fi

if [ -z "${VAULT_ENC_KEY:-}" ]; then
  cat >&2 <<'AVISO'

⚠️  VAULT_ENC_KEY ausente. NÃO gere uma nova: as senhas já salvas no Cofre foram
    cifradas com a chave que está na Vercel. Sem ela o app usa o fallback
    (HELENA_TOKEN_ENC_KEY) e as linhas cifradas com a chave original ficam
    ILEGÍVEIS. Copie o valor de produção antes de liberar o Cofre.
AVISO
fi

[ "$REVELAR" != "1" ] && echo "Valores mascarados. Use --revelar para ver completos."
exit 0
