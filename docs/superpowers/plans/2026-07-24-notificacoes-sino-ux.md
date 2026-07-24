# Polimento do sino de notificações — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposicionar o sino de notificações para o rodapé da sidebar e enriquecer o painel com distinção visual por tipo, agrupamento por dia, filtro não-lidas/todas e descarte de notificações.

**Architecture:** UI incremental sobre a feature de notificações existente (tabela `notifications`, actions em `src/lib/notifications`, painel em `notification-bell.tsx`). O "descartar" usa soft-delete (coluna `dismissed_at`) para não conflitar com o cron de prazo. Lógica pura de apresentação (ícone/cor por tipo, bucket de dia) extraída para um módulo testável.

**Tech Stack:** Next.js (App Router, Server Actions), React client components, Supabase (Postgres + Realtime), lucide-react (ícones), Tailwind, Vitest (jsdom) para testes de lógica pura.

## Global Constraints

- App em **produção**; toda etapa é **aditiva** e não pode quebrar prod. Um **commit isolado por tarefa**.
- Migrations vivem em `supabase/migrations/`, schema `clinic_control`, próximo número livre = **`0064`** (0059–0063 já ocupados).
- **Ordem de deploy crítica:** a migration `0064` precisa estar **aplicada no Supabase de produção ANTES** de o código que filtra `dismissed_at` (Task 3) ir para `main` (push → deploy Vercel). Filtrar uma coluna inexistente derruba as notificações. Ver "Notas de deploy".
- Testes: `npm test` (= `vitest run`). Só lógica pura tem teste unitário — segue o padrão do repo (`tests/*.test.ts`); UI e actions são verificadas por `npx tsc --noEmit` + `npm run lint` + checagem manual.
- Idioma da UI/copy: **português (pt-BR)**, seguindo o existente.
- Notificar/descartar são efeitos colaterais: nada pode lançar e derrubar a experiência (padrão já usado em `createNotifications`).

---

## File Structure

- **Create** `supabase/migrations/0064_notification_dismissed.sql` — coluna `dismissed_at` (soft-delete).
- **Create** `src/lib/notifications/display.ts` — lógica pura de apresentação: `notificationVisual(type)` e `dayBucket(createdAtIso, now)`. Client-safe (sem `server-only`).
- **Create** `tests/notifications-display.test.ts` — testes das funções puras acima.
- **Modify** `src/lib/notifications/actions.ts` — filtrar `dismissed_at is null` nas leituras + nova action `dismissNotification`.
- **Modify** `src/components/notifications/notification-context.tsx` — expor `dismiss(id)` (otimista) no contexto.
- **Modify** `src/components/notifications/notification-bell.tsx` — modo compacto (rodapé), dropdown para cima, ícone/cor por tipo, agrupamento por dia, filtro e botão descartar.
- **Modify** `src/components/app-nav.tsx` — remover o sino do topo; inseri-lo no rodapé como ícone à esquerda do usuário, só com a sidebar expandida.

---

## Task 1: Migration `0064` (soft-delete de notificações)

**Files:**
- Create: `supabase/migrations/0064_notification_dismissed.sql`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `clinic_control.notifications.dismissed_at timestamptz` (nullable). `null` = ativa; timestamp = descartada.

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- Soft-delete de notificações: "descartar" no sino grava dismissed_at em vez de
-- apagar a linha. Motivo: o cron de prazo (0063_notify_task_due) deduplica por
-- dedupe_key único com ON CONFLICT DO NOTHING, o que depende da LINHA existir.
-- Apagar a linha faria o cron diário recriar o aviso no dia seguinte. Mantendo a
-- linha (só marcando dismissed_at) o descarte "cola". As leituras passam a filtrar
-- dismissed_at IS NULL. Aditivo e não-destrutivo.
set search_path to clinic_control, public;

alter table notifications add column if not exists dismissed_at timestamptz;
```

- [ ] **Step 2: Conferir que o SQL é válido e aditivo**

Ler o arquivo e confirmar: sem `drop`, sem `not null` sem default, sem alteração de linha existente. Só um `add column if not exists` nullable.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0064_notification_dismissed.sql
git commit -m "feat(notificacoes): coluna dismissed_at para descartar (soft-delete)"
```

> **Após o commit:** a aplicação em produção é uma etapa operacional fora do código — ver "Notas de deploy". NÃO prossiga para a Task 3 em produção antes de a coluna existir no banco de prod.

---

## Task 2: Lógica pura de apresentação (`display.ts`) — TDD

**Files:**
- Create: `src/lib/notifications/display.ts`
- Test: `tests/notifications-display.test.ts`

**Interfaces:**
- Consumes: `NotificationType` de `src/lib/notifications/types.ts`.
- Produces:
  - `notificationVisual(type: string): { Icon: LucideIcon; colorClass: string }` — mapa tipo→ícone+cor, com fallback `Bell`/`text-muted-foreground` para tipo desconhecido.
  - `type DayBucket = "hoje" | "ontem" | "semana" | "antes"`
  - `dayBucket(createdAtIso: string, now: Date): DayBucket` — bucket temporal no fuso `America/Sao_Paulo`.

- [ ] **Step 1: Escrever os testes que falham**

Create `tests/notifications-display.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AtSign, Bell } from "lucide-react";
import { notificationVisual, dayBucket } from "@/lib/notifications/display";

describe("notificationVisual", () => {
  it("mapeia 'mention' para AtSign", () => {
    expect(notificationVisual("mention").Icon).toBe(AtSign);
  });
  it("usa fallback Bell para tipo desconhecido", () => {
    const v = notificationVisual("tipo_que_nao_existe");
    expect(v.Icon).toBe(Bell);
    expect(v.colorClass).toBe("text-muted-foreground");
  });
});

describe("dayBucket (fuso America/Sao_Paulo)", () => {
  // now fixo: 2026-07-24 12:00 em São Paulo (UTC-3) = 15:00Z
  const now = new Date("2026-07-24T15:00:00Z");

  it("mesmo dia => hoje", () => {
    expect(dayBucket("2026-07-24T09:00:00Z", now)).toBe("hoje");
  });
  it("dia anterior => ontem", () => {
    expect(dayBucket("2026-07-23T18:00:00Z", now)).toBe("ontem");
  });
  it("3 dias atrás => semana", () => {
    expect(dayBucket("2026-07-21T12:00:00Z", now)).toBe("semana");
  });
  it("10 dias atrás => antes", () => {
    expect(dayBucket("2026-07-14T12:00:00Z", now)).toBe("antes");
  });
  it("madrugada UTC que ainda é ontem em SP => ontem", () => {
    // 2026-07-24T02:00:00Z = 2026-07-23 23:00 em SP => é 'ontem' relativo ao now
    expect(dayBucket("2026-07-24T02:00:00Z", now)).toBe("ontem");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- notifications-display`
Expected: FAIL — `Cannot find module '@/lib/notifications/display'`.

- [ ] **Step 3: Implementar `display.ts`**

Create `src/lib/notifications/display.ts`:

```ts
// Lógica pura de apresentação de notificações — client-safe (sem "use server"/
// "server-only"), para o painel e testes importarem o mesmo vocabulário.
import {
  AtSign,
  UserPlus,
  MessageSquare,
  Clock,
  AlertTriangle,
  ClipboardList,
  Bell,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "./types";

export type NotificationVisual = { Icon: LucideIcon; colorClass: string };

const VISUALS: Record<NotificationType, NotificationVisual> = {
  mention: { Icon: AtSign, colorClass: "text-brand" },
  task_assigned: { Icon: UserPlus, colorClass: "text-indigo-400" },
  task_comment: { Icon: MessageSquare, colorClass: "text-slate-400" },
  task_due_soon: { Icon: Clock, colorClass: "text-amber-400" },
  task_overdue: { Icon: AlertTriangle, colorClass: "text-red-400" },
  acompanhamento_assigned: { Icon: ClipboardList, colorClass: "text-teal-400" },
};

/** Ícone + cor por tipo. Fallback neutro para tipo desconhecido (nunca quebra). */
export function notificationVisual(type: string): NotificationVisual {
  return VISUALS[type as NotificationType] ?? { Icon: Bell, colorClass: "text-muted-foreground" };
}

export type DayBucket = "hoje" | "ontem" | "semana" | "antes";

// Data-calendário de São Paulo no formato YYYY-MM-DD (en-CA => ISO-like).
function spDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Agrupa por proximidade no fuso America/Sao_Paulo. `now` é injetado p/ testes. */
export function dayBucket(createdAtIso: string, now: Date): DayBucket {
  // Compara as datas-calendário de SP como UTC-midnight (diferença em dias inteiros).
  const created = Date.parse(spDate(new Date(createdAtIso)));
  const today = Date.parse(spDate(now));
  const diffDays = Math.round((today - created) / 86_400_000);
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return "semana";
  return "antes";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- notifications-display`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/display.ts tests/notifications-display.test.ts
git commit -m "feat(notificacoes): lógica pura de ícone/cor por tipo e bucket de dia"
```

---

## Task 3: Camada de dados — filtrar descartadas + action `dismissNotification`

**Files:**
- Modify: `src/lib/notifications/actions.ts`

**Interfaces:**
- Consumes: coluna `dismissed_at` (Task 1); `getSessionUser`, `createClient` já importados no arquivo.
- Produces: `dismissNotification(id: string): Promise<{ ok: true } | { ok: false; error: string }>`. `listNotifications` passa a aceitar `limit = 30` por padrão.

> **PRÉ-REQUISITO DE PROD:** a migration `0064` já aplicada no banco de produção (ver Notas de deploy). Sem a coluna, os `.is("dismissed_at", null)` deste passo derrubam as leituras.

- [ ] **Step 1: Filtrar `dismissed_at` nas leituras e subir o limite**

Em `src/lib/notifications/actions.ts`, na função `listNotifications`, trocar a assinatura do limite e adicionar o filtro:

```ts
/** Notificações do usuário logado (mais recentes primeiro). */
export async function listNotifications(limit = 30): Promise<NotificationRow[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("recipient_id", user.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapRow);
}
```

Na `getUnreadNotificationCount`, adicionar o mesmo filtro (uma descartada não conta como não-lida):

```ts
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null)
    .is("dismissed_at", null);
```

- [ ] **Step 2: Adicionar a action `dismissNotification`**

No fim de `src/lib/notifications/actions.ts`, seguindo o padrão de `markNotificationRead`:

```ts
/** Descarta (soft-delete) uma notificação do próprio usuário. Idempotente. */
export async function dismissNotification(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", user.id)
    .is("dismissed_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: sem erros novos.
Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications/actions.ts
git commit -m "feat(notificacoes): leituras filtram descartadas + action dismissNotification"
```

---

## Task 4: Reposicionar o sino no rodapé

**Files:**
- Modify: `src/components/notifications/notification-bell.tsx`
- Modify: `src/components/app-nav.tsx`

**Interfaces:**
- Consumes: `NotificationBell` (componente existente).
- Produces: prop nova `compact?: boolean` em `NotificationBell` — força gatilho só-ícone e dropdown ancorado na base (abre para cima).

- [ ] **Step 1: Adicionar a prop `compact` ao `NotificationBell`**

Em `src/components/notifications/notification-bell.tsx`, atualizar a assinatura:

```tsx
export function NotificationBell({
  placement,
  expanded = false,
  compact = false,
}: {
  placement: "sidebar" | "topbar";
  expanded?: boolean;
  compact?: boolean;
}) {
```

- [ ] **Step 2: Gatilho só-ícone quando `compact`**

Ainda no `NotificationBell`, o badge deve usar o formato de canto quando compacto. Trocar a condição do badge:

```tsx
          placement === "topbar" || !expanded || compact
            ? "absolute -right-0.5 -top-0.5 min-w-4 px-1 py-px text-[0.6rem] leading-none"
            : "min-w-5 px-1.5 py-0.5 text-[0.65rem] leading-none",
```

E o gatilho da sidebar deve renderizar só o ícone quando `compact` (sem a linha larga "Notificações"). Trocar a condição que mostra o rótulo:

```tsx
        <Bell className="size-4 shrink-0" />
        {expanded && !compact && <span className="flex-1 truncate text-left">Notificações</span>}
        {badge}
```

E o layout do botão da sidebar deve ficar quadrado quando compacto:

```tsx
        className={cn(
          "relative flex h-11 items-center gap-2.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground md:h-9",
          expanded && !compact ? "w-full px-2.5" : "size-11 justify-center md:size-9",
        )}
```

- [ ] **Step 3: Dropdown abre para cima quando `compact`**

Trocar o posicionamento do painel (a `div` com `absolute z-[1300] ...`):

```tsx
          className={cn(
            "absolute z-[1300] flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/40",
            placement === "topbar"
              ? "right-0 top-full mt-2"
              : compact
                ? "bottom-0 left-full ml-2"
                : "bottom-0 left-full ml-2 md:bottom-auto md:top-0",
          )}
```

- [ ] **Step 4: Remover o sino do topo da sidebar**

Em `src/components/app-nav.tsx`, apagar o bloco (após a Global Search):

```tsx
          {/* Sino de notificações */}
          <div className="mb-1 px-2 shrink-0">
            <NotificationBell placement="sidebar" expanded={open} />
          </div>
```

- [ ] **Step 5: Inserir o sino no rodapé, à esquerda do nome**

No bloco `{/* Footer: usuário logado + sair */}`, dentro da `div` flex, antes do `{open && user && ...}`, adicionar o sino só quando `open`:

```tsx
            <div className={cn("flex items-center gap-2", !open && "justify-center")}>
              {open && <NotificationBell placement="sidebar" compact />}
              {open && user && (
                <div className="min-w-0 flex-1 px-1">
                  <p className="truncate text-xs font-medium text-sidebar-foreground">{user.name}</p>
                  <p className="text-[0.65rem] capitalize text-muted-foreground/70">{user.role}</p>
                </div>
              )}
              <form action={signOut}>
```

- [ ] **Step 6: Typecheck + lint + checagem manual**

Run: `npx tsc --noEmit` → sem erros novos.
Run: `npm run lint` → sem erros novos.
Manual (`npm run dev`): a) o sino sumiu do topo; b) aparece no rodapé, à esquerda do nome, com a sidebar aberta (pin ou hover); c) recolhida, some; d) clicar abre o painel **para cima** sem cortar na base da tela; e) mobile (top bar) inalterado.

- [ ] **Step 7: Commit**

```bash
git add src/components/notifications/notification-bell.tsx src/components/app-nav.tsx
git commit -m "feat(notificacoes): sino no rodapé da sidebar (dropdown abre para cima)"
```

---

## Task 5: Distinção visual por tipo + agrupamento por dia

**Files:**
- Modify: `src/components/notifications/notification-bell.tsx`

**Interfaces:**
- Consumes: `notificationVisual`, `dayBucket`, `DayBucket` de `src/lib/notifications/display.ts` (Task 2); `items` do `useNotifications()`.
- Produces: painel com ícone/cor por tipo e cabeçalhos de dia.

- [ ] **Step 1: Importar a lógica de apresentação**

No topo de `notification-bell.tsx`:

```tsx
import { notificationVisual, dayBucket, type DayBucket } from "@/lib/notifications/display";
```

- [ ] **Step 2: Agrupar `items` por bucket de dia (ordem estável)**

Dentro do componente, antes do `return`, montar os grupos preservando a ordem (items já vêm desc por `created_at`):

```tsx
  const BUCKET_LABEL: Record<DayBucket, string> = {
    hoje: "Hoje",
    ontem: "Ontem",
    semana: "Esta semana",
    antes: "Antes",
  };
  const ORDER: DayBucket[] = ["hoje", "ontem", "semana", "antes"];
  const now = new Date();
  const grouped = ORDER.map((bucket) => ({
    bucket,
    label: BUCKET_LABEL[bucket],
    rows: items.filter((n) => dayBucket(n.created_at, now) === bucket),
  })).filter((g) => g.rows.length > 0);
```

- [ ] **Step 3: Renderizar por grupo, com ícone/cor por tipo**

Substituir a `<ul>` única (que hoje faz `items.map`) por uma seção por grupo. Trocar o corpo do ramo "tem itens" por:

```tsx
              <div>
                {grouped.map((g) => (
                  <div key={g.bucket}>
                    <p className="sticky top-0 z-10 bg-popover px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {g.label}
                    </p>
                    <ul className="divide-y divide-border/50">
                      {g.rows.map((n) => {
                        const { Icon, colorClass } = notificationVisual(n.type);
                        return (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => onItemClick(n.id, n.url)}
                              className={cn(
                                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40",
                                !n.read_at && "bg-accent/20",
                              )}
                            >
                              <span className="relative mt-0.5 shrink-0">
                                <Icon className={cn("size-4", colorClass)} />
                                {!n.read_at && (
                                  <span className="absolute -right-1 -top-1 size-2 rounded-full bg-brand" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium leading-snug text-foreground">
                                  {n.title}
                                </span>
                                {n.body && (
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    {n.body}
                                  </span>
                                )}
                                <span className="mt-1 block text-[0.65rem] text-muted-foreground/70">
                                  {timeAgo(n.created_at)}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
```

- [ ] **Step 4: Typecheck + lint + checagem manual**

Run: `npx tsc --noEmit` → sem erros novos.
Run: `npm run lint` → sem erros novos.
Manual: com notificações de tipos diferentes, cada uma mostra seu ícone/cor; os cabeçalhos "Hoje/Ontem/Esta semana/Antes" aparecem só quando há itens no grupo; não-lidas têm o pontinho.

- [ ] **Step 5: Commit**

```bash
git add src/components/notifications/notification-bell.tsx
git commit -m "feat(notificacoes): ícone/cor por tipo e agrupamento por dia no painel"
```

---

## Task 6: Ações no painel — filtro Não-lidas/Todas + descartar

**Files:**
- Modify: `src/components/notifications/notification-context.tsx`
- Modify: `src/components/notifications/notification-bell.tsx`

**Interfaces:**
- Consumes: `dismissNotification` (Task 3); `notificationVisual`/`dayBucket` já importados (Task 5).
- Produces: `dismiss(id: string): void` no contexto de notificações; toggle de filtro e botão "×" por item no painel.

- [ ] **Step 1: Expor `dismiss` no contexto**

Em `src/components/notifications/notification-context.tsx`, importar a action e ampliar o tipo `Ctx`:

```tsx
import {
  listNotifications,
  getUnreadNotificationCount,
  getRealtimeToken,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "@/lib/notifications/actions";
```

```tsx
type Ctx = {
  count: number;
  items: NotificationRow[];
  loading: boolean;
  loadItems: () => Promise<void>;
  markRead: (id: string) => void;
  markAll: () => void;
  dismiss: (id: string) => void;
};
```

- [ ] **Step 2: Implementar `dismiss` otimista**

Depois de `markAll`, adicionar (mesmo padrão otimista de `markRead`):

```tsx
  const dismiss = useCallback((id: string) => {
    // Otimista: remove da lista já; se era não-lida, baixa o contador. Reverte no erro.
    let wasUnread = false;
    setItems((prev) =>
      prev.filter((n) => {
        if (n.id === id) {
          wasUnread = !n.read_at;
          return false;
        }
        return true;
      }),
    );
    if (wasUnread) setCount((c) => Math.max(0, c - 1));
    void dismissNotification(id).then((res) => {
      if (!res.ok) {
        void refreshCount();
        void loadItems();
      }
    });
  }, [refreshCount, loadItems]);
```

E incluir no value do provider:

```tsx
  const value: Ctx = { count, items, loading, loadItems, markRead, markAll, dismiss };
```

- [ ] **Step 3: Consumir `dismiss` e adicionar o filtro no painel**

Em `notification-bell.tsx`, pegar `dismiss` do hook e criar o estado do filtro. Trocar a desestruturação:

```tsx
  const { count, items, loading, loadItems, markRead, markAll, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
```

Aplicar o filtro ANTES do agrupamento (Task 5) — trocar `items.filter(...)` do `grouped` para usar a lista filtrada:

```tsx
  const visible = filter === "unread" ? items.filter((n) => !n.read_at) : items;
```

e no `grouped`, trocar `rows: items.filter(...)` por `rows: visible.filter(...)`.

- [ ] **Step 4: Toggle de filtro no cabeçalho do painel**

No cabeçalho (a `div` com "Notificações" + "Marcar todas como lidas"), adicionar o toggle logo abaixo do título. Inserir, dentro do painel e acima da área de scroll:

```tsx
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                filter === "all" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                filter === "unread" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Não-lidas
            </button>
          </div>
```

- [ ] **Step 5: Botão descartar por item**

Importar o ícone `X` (junto de `Bell, Check, Loader2`):

```tsx
import { Bell, Check, Loader2, X } from "lucide-react";
```

O item vira um contêiner relativo com o botão "×" no hover. Envolver o `<button>` do item numa `div` relativa e adicionar o descarte (dentro do `<li>` do Step 3 da Task 5, trocar o conteúdo do `<li>`):

```tsx
                          <li key={n.id} className="group/item relative">
                            <button
                              type="button"
                              onClick={() => onItemClick(n.id, n.url)}
                              className={cn(
                                "flex w-full items-start gap-3 py-3 pl-4 pr-9 text-left transition-colors hover:bg-accent/40",
                                !n.read_at && "bg-accent/20",
                              )}
                            >
                              {/* ...ícone + textos idênticos ao Step 3 da Task 5... */}
                            </button>
                            <button
                              type="button"
                              aria-label="Descartar notificação"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismiss(n.id);
                              }}
                              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/item:opacity-100"
                            >
                              <X className="size-3.5" />
                            </button>
                          </li>
```

> Nota: o conteúdo interno do `<button>` de item (ícone + títulos) é exatamente o do Step 3 da Task 5 — mantenha-o, apenas trocando as classes de padding para `py-3 pl-4 pr-9` (abre espaço para o "×") e envolvendo o `<li>` com `group/item relative`.

- [ ] **Step 6: Typecheck + lint + checagem manual**

Run: `npx tsc --noEmit` → sem erros novos.
Run: `npm run lint` → sem erros novos.
Manual: a) toggle "Todas/Não-lidas" filtra a lista; b) "×" aparece no hover e some a notificação na hora; c) descartar uma não-lida baixa o badge; d) recarregar a página: a descartada não volta; e) descartar uma de prazo/atraso e (se possível) re-rodar o cron não a recria.

- [ ] **Step 7: Commit**

```bash
git add src/components/notifications/notification-context.tsx src/components/notifications/notification-bell.tsx
git commit -m "feat(notificacoes): filtro não-lidas/todas e descartar no painel"
```

---

## Notas de deploy (prod)

- **Aplicar a `0064` no Supabase de produção ANTES de enviar a Task 3+ para `main`.** O push para `main` dispara deploy na Vercel; se o código que filtra `dismissed_at` subir antes da coluna existir, as leituras de notificação quebram.
- No momento o MCP do Supabase está conectado à org errada e os projetos estão pausados — aplicar a migration exige o **projeto correto conectado/despausado** (coordenar com o usuário). A aplicação pode ser via Supabase CLI (`supabase db push`), dashboard (SQL editor) ou MCP `apply_migration` no projeto certo.
- Sequência segura recomendada: Task 1 (commit) → aplicar `0064` em prod → Tasks 2–6 (commits) → push → deploy.

## Self-Review (feito)

- **Cobertura do spec:** lugar do sino (Task 4) ✓; ícone/cor por tipo + agrupamento (Tasks 2+5) ✓; filtro não-lidas/todas (Task 6) ✓; descartar soft-delete + migration `0064` + reads filtrando (Tasks 1+3+6) ✓; limite 20→30 (Task 3) ✓; sem Realtime continua no fallback (inalterado) ✓; testes de lógica pura (Task 2) ✓.
- **Placeholders:** nenhum "TBD/TODO"; a única referência cruzada ("conteúdo idêntico ao Step 3 da Task 5") aponta para código completo já escrito no mesmo documento, com a diferença explícita (padding/`group`) descrita.
- **Consistência de tipos:** `dismissNotification` (Task 3) ↔ import em Task 6 ✓; `notificationVisual`/`dayBucket`/`DayBucket` (Task 2) ↔ uso em Task 5/6 ✓; prop `compact` (Task 4) ✓; `dismiss` no `Ctx` (Task 6) ✓.
- **Regressão do cron:** coberta pela decisão de soft-delete e pelo passo de verificação manual (Task 6, item e).
