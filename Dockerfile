# Imagem de produção do Clinic Control (Next.js 16, App Router).
# Build em 3 estágios; a imagem final leva só o output `standalone`.
# Ver deploy/README.md para o runbook completo.

FROM node:24-alpine AS base
# sharp e alguns binários nativos esperam glibc; no Alpine isso resolve.
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

# --- dependências -----------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# As NEXT_PUBLIC_* são embutidas no bundle do navegador em tempo de BUILD —
# não adianta passá-las só em runtime. São valores públicos (URL do projeto e
# chave anônima do Supabase), por isso podem viver como build arg.
# Todo o resto (service role, chaves de cifra, tokens) chega em runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Liga o `output: "standalone"` do next.config.ts. Sem isto o build sai no
# formato normal e o estágio de runtime não encontra .next/standalone.
ENV DOCKER_BUILD=1

RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
    || (echo "ERRO: NEXT_PUBLIC_SUPABASE_URL vazia no build — o bundle sairia sem Supabase." && exit 1)
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# server.js e o mínimo de node_modules que o trace apontou.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# O standalone não copia .next/static nem public; sem isso o app sobe sem CSS/JS.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# /login é a única rota pública que renderiza sem sessão — serve de sonda.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
