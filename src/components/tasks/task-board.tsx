"use client"

import { useRef, useState, useSyncExternalStore, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2, List, LayoutGrid, CalendarDays, CheckCircle2, Archive, RotateCcw, SlidersHorizontal, Repeat, Clock, Play, Pause, BarChart3, ExternalLink, Pin, PinOff, Target, Search, X, FilterX } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { CreateTaskDialog } from "./create-task-dialog"
import { GenerateSuggestionsButton } from "./generate-suggestions-button"
import { RecurrencesDialog } from "./recurrences-dialog"
import { TaskSuggestions } from "./task-suggestions"
import { TaskDetailDialog } from "./task-detail-dialog"
import { KanbanBoard } from "./kanban-board"
import { TaskDashboard } from "./task-dashboard"
import { SnoozeButton, fmtSnoozeDate } from "./snooze-button"
import { profileLabel, type ClinicOption, type ProfileOption } from "./task-fields"
import {
  ALL,
  NONE,
  DEFAULT_LIST_FILTERS,
  DUE_LABEL,
  SOURCE_LABEL,
  MARKER_LABEL,
  activeFilterCount,
  matchesFilters,
  parseStoredFilters,
  type DueFilter,
  type ListFilters,
  type MarkerFilter,
  type SourceFilter,
} from "@/lib/tasks/filters"
import {
  updateTaskStatus,
  bulkUpdateTaskStatus,
  deleteTask,
  snoozeTask,
  pinTask,
  listArchivedTasks,
  unarchiveTask,
  type TaskRow,
  type TaskSuggestionRow,
} from "@/lib/tasks/actions"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_RANK,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/categories"
import type { TaskCategoryRow } from "@/lib/tasks/category-actions"
import type { SuggestionJobRow } from "@/lib/tasks/generate-actions"
import { agendaBucket, spDateParts, AGENDA_ORDER, AGENDA_LABEL, type AgendaBucket } from "@/lib/tasks/agenda"

// ── Filtros lembrados entre visitas ─────────────────────────────────────────
// Mesma ideia do estado da sidebar (`cc-sidebar-pinned`): o valor vive fora do
// React e é lido por useSyncExternalStore, para hidratar sem setState em effect.
// A memória é a verdade e o localStorage é só o backup — em modo privativo o
// filtro continua funcionando, só não lembra na próxima visita.
const FILTERS_STORAGE_KEY = "cc-tarefas-filtros"
const FILTERS_EVENT = "cc-tarefas-filtros-change"

let filtersStore: ListFilters | null = null

function readStoredFilters(): ListFilters {
  if (filtersStore === null) {
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(FILTERS_STORAGE_KEY)
    } catch {
      // Sem acesso ao storage: começa no padrão.
    }
    filtersStore = parseStoredFilters(raw)
  }
  return filtersStore
}

function writeStoredFilters(next: ListFilters) {
  // A busca é de sessão (filtro de texto velho ao voltar na página parece bug).
  filtersStore = { ...next, query: "" }
  try {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filtersStore))
  } catch {
    // Quota/modo privativo: segue só em memória.
  }
  window.dispatchEvent(new Event(FILTERS_EVENT))
}

function subscribeFilters(onChange: () => void) {
  window.addEventListener(FILTERS_EVENT, onChange)
  return () => window.removeEventListener(FILTERS_EVENT, onChange)
}

// "Mostrar concluídas" — mesma ideia acima, chave própria (não é um recorte de
// busca, é um toggle de visão). Sem persistir, o toggle voltava a esconder as
// concluídas a cada visita à página, o que fazia parecer que elas tinham sumido.
const SHOW_DONE_STORAGE_KEY = "cc-tarefas-mostrar-concluidas"
const SHOW_DONE_EVENT = "cc-tarefas-mostrar-concluidas-change"

function readStoredShowDone(): boolean {
  try {
    return window.localStorage.getItem(SHOW_DONE_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeStoredShowDone(value: boolean) {
  try {
    window.localStorage.setItem(SHOW_DONE_STORAGE_KEY, value ? "1" : "0")
  } catch {
    // Quota/modo privativo: segue só em memória (não persiste, mas não quebra).
  }
  window.dispatchEvent(new Event(SHOW_DONE_EVENT))
}

function subscribeShowDone(onChange: () => void) {
  window.addEventListener(SHOW_DONE_EVENT, onChange)
  return () => window.removeEventListener(SHOW_DONE_EVENT, onChange)
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgente: "bg-red-400",
  alta: "bg-orange-400",
  media: "bg-amber-400",
  baixa: "bg-zinc-400",
}

const DONE_STATUSES = new Set<TaskStatus>(["concluida", "cancelada"])

// Frase curta pro toast de feedback ao mudar status (o "o que acabei de fazer").
const STATUS_TOAST: Record<TaskStatus, string> = {
  pendente: "Marcada como pendente",
  em_andamento: "Marcada como em andamento",
  concluida: "Tarefa concluída",
  cancelada: "Tarefa descartada",
}

function dateLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

function isOverdue(t: TaskRow): boolean {
  if (!t.due_date || DONE_STATUSES.has(t.status)) return false
  return t.due_date < new Date().toISOString().slice(0, 10)
}

/** Linha de tarefa reutilizada nos modos Lista e Semana. */
function TaskListItem({
  t,
  categoryLabel,
  pending,
  today,
  onOpen,
  onChangeStatus,
  onRemove,
  onSnooze,
  onPin,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  t: TaskRow
  categoryLabel: Record<string, string>
  pending: boolean
  today: string
  onOpen: (id: string) => void
  onChangeStatus: (id: string, status: TaskStatus) => void
  onRemove: (id: string) => void
  onSnooze: (id: string, until: string | null) => void
  onPin: (id: string, pinned: boolean) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string, shiftKey: boolean) => void
}) {
  const isDone = t.status === "concluida"
  const isSnoozed = t.snoozed_until != null && t.snoozed_until > today
  const isInProgress = t.status === "em_andamento"
  const isPinned = t.pinned_at != null
  return (
    // Mobile: card com borda (edição de status via detalhe/sheet); desktop: linha densa.
    // Em andamento é sinalizado só pelo selo "em andamento" (sem faixa lateral).
    // `group` habilita o botão "Concluir" que só aparece no hover da linha (desktop).
    // Fixada não precisa de tint próprio: a linha vive dentro do bloco "Em foco"
    // (que já é destacado) e carrega o selo "em foco".
    <li className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 bg-card p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:py-2.5">
      {selectable && (
        // onClick (não onCheckedChange) para capturar Shift e fazer seleção em
        // intervalo; o estado `checked` é controlado pelo pai, então a caixa
        // reflete a seleção mesmo sem handler de mudança próprio.
        <Checkbox
          checked={selected}
          onCheckedChange={() => {}}
          onClick={(e) => onToggleSelect?.(t.id, e.shiftKey)}
          aria-label={`Selecionar tarefa ${t.title}`}
          className="hidden sm:inline-flex"
        />
      )}
      <span
        className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`}
        title={TASK_PRIORITY_LABEL[t.priority]}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(t.id)}
          className={`text-left text-sm font-medium hover:underline ${DONE_STATUSES.has(t.status) ? "text-muted-foreground line-through" : ""}`}
        >
          {t.title}
        </button>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="rounded bg-accent/50 px-1.5 py-0.5">{categoryLabel[t.category] ?? t.category}</span>
          {t.clinic_id && t.clinic_name && (
            <>
              ·{" "}
              <Link href={`/clinicas/${t.clinic_id}`} className="hover:text-foreground transition-colors">
                {t.clinic_name}
              </Link>
            </>
          )}
          {t.assigned_to_name && <>· {t.assigned_to_name}</>}
          {t.due_date && (
            <span className={isOverdue(t) ? "font-semibold text-red-400" : undefined}>
              · prazo {dateLabel(t.due_date)}
            </span>
          )}
          {isInProgress && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-500">
              <span className="size-1.5 rounded-full bg-amber-500" />
              em andamento
            </span>
          )}
          {t.source === "ia" && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-400">
              IA
            </span>
          )}
          {t.recurrence_id && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-brand">
              <Repeat className="size-2.5" />
              recorrente
            </span>
          )}
          {isSnoozed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.62rem] font-semibold text-muted-foreground">
              <Clock className="size-2.5" />
              adiada
            </span>
          )}
          {isPinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-brand">
              <Pin className="size-2.5" />
              em foco
            </span>
          )}
        </p>
      </div>

      {/* Abrir a tarefa em página cheia (deep-link) — atalho direto sem passar
          pelo modal. Sempre visível (discreto), já que é o pedido de "achar
          fácil"; realça no hover. */}
      <Link
        href={`/tarefas/${t.id}`}
        title="Abrir em página"
        aria-label={`Abrir tarefa ${t.title} em página`}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground sm:size-8"
      >
        <ExternalLink className="size-3.5" />
      </Link>

      {/* Concluir/Reabrir — no desktop só aparece no hover/foco da linha; no
          mobile fica sempre visível (não há hover). Ocupa o espaço mesmo
          invisível para não haver salto de layout ao passar o mouse. */}
      <Button
        type="button"
        size="sm"
        variant={isDone ? "ghost" : "outline"}
        disabled={pending}
        onClick={() => onChangeStatus(t.id, isDone ? "pendente" : "concluida")}
        title={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
        className={`gap-1 transition-opacity focus-visible:opacity-100 focus-visible:pointer-events-auto sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto ${isDone ? "text-muted-foreground hover:text-foreground" : "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-500"}`}
      >
        {isDone ? <RotateCcw className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
        {isDone ? "Reabrir" : "Concluir"}
      </Button>

      <Select
        value={t.status}
        items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABEL[s]]))}
        onValueChange={(v) => v && onChangeStatus(t.id, v as TaskStatus)}
      >
        {/* Select inline só no desktop — no mobile o status muda pelo detalhe (sheet) */}
        <SelectTrigger className="hidden min-w-[9rem] text-xs sm:flex sm:h-7">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(t.status === "pendente" || t.status === "em_andamento") && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={pending}
          title={isInProgress ? "Pausar (voltar para pendente)" : "Iniciar (marcar em andamento)"}
          aria-label={isInProgress ? "Pausar tarefa" : "Iniciar tarefa"}
          className={`size-9 sm:size-8 ${isInProgress ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/60 hover:text-amber-500"}`}
          onClick={() => onChangeStatus(t.id, isInProgress ? "pendente" : "em_andamento")}
        >
          {isInProgress ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
      )}

      {/* Fixar em foco — sobe a tarefa pro bloco "Em foco" no topo da lista.
          Sempre visível quando fixada (é estado); discreto quando não. */}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        title={isPinned ? "Soltar (sair do foco)" : "Fixar em foco"}
        aria-label={isPinned ? `Soltar tarefa ${t.title}` : `Fixar tarefa ${t.title} em foco`}
        aria-pressed={isPinned}
        className={`size-9 sm:size-8 ${isPinned ? "text-brand hover:text-brand" : "text-muted-foreground/60 hover:text-brand"}`}
        onClick={() => onPin(t.id, !isPinned)}
      >
        {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      </Button>

      <SnoozeButton
        today={today}
        snoozedUntil={t.snoozed_until}
        onSnooze={(until) => onSnooze(t.id, until)}
      />

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        title="Excluir tarefa"
        className="size-9 sm:size-8"
        onClick={() => onRemove(t.id)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  )
}

interface TaskBoardProps {
  tasks: TaskRow[]
  suggestions: TaskSuggestionRow[]
  /** Jobs de geração de sugestões do usuário (botão "Gerar da IA" acompanha o ativo). */
  suggestionJobs?: SuggestionJobRow[]
  clinics: (ClinicOption & { developerId: string | null })[]
  profiles: ProfileOption[]
  categories: TaskCategoryRow[]
  /** Usuário logado — usado na aba "Semana" (agenda pessoal). */
  currentUserId?: string | null
  /** Gestor pode criar regras recorrentes de carteira (fan-out). */
  isGestor?: boolean
  /** Pré-seleciona a clínica no formulário de nova tarefa (painel embutido no perfil da clínica). */
  defaultClinicId?: string | null
}

export function TaskBoard({ tasks: initialTasks, suggestions, suggestionJobs = [], clinics, profiles, categories, currentUserId = null, isGestor = false, defaultClinicId = null }: TaskBoardProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  // Cópia local para atualização otimista (arrastar no board / trocar status na
  // lista reflete na hora). Re-sincroniza quando o servidor envia nova lista
  // (criação, exclusão, aceite de sugestão, edição no detalhe — que dão refresh).
  const [tasks, setTasks] = useState(initialTasks)
  // Seleção múltipla da lista (ação em lote). Limpa ao chegar nova lista do servidor.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Âncora da seleção: última tarefa clicada sem Shift. Shift+clique seleciona o
  // intervalo daqui até a clicada, na ordem exibida.
  const [anchorId, setAnchorId] = useState<string | null>(null)
  // Ordem atual dos ids na lista renderizada — alimentado após calcular
  // `filtered`; lido no clique com Shift para resolver o intervalo.
  const orderedIdsRef = useRef<string[]>([])
  // Re-sincroniza com o servidor (criação, exclusão, aceite de sugestão, edição
  // no detalhe) ajustando o estado durante o render — padrão recomendado do React
  // em vez de setState num efeito (evita render em cascata e flash de dado velho).
  const [prevInitial, setPrevInitial] = useState(initialTasks)
  if (initialTasks !== prevInitial) {
    setPrevInitial(initialTasks)
    setTasks(initialTasks)
    setSelected(new Set())
    setAnchorId(null)
  }
  // Todos os filtros num objeto só — simplifica persistir e limpar de uma vez.
  // A lógica de casamento vive em lib/tasks/filters.ts (pura, com teste). Os
  // selects vêm do store persistido; a busca é estado normal (não é lembrada).
  // No SSR o snapshot é o padrão, então a primeira pintura vem sem filtro e o
  // cliente aplica na hidratação — mesmo trade-off já aceito no "esconder adiadas".
  const storedFilters = useSyncExternalStore(subscribeFilters, readStoredFilters, () => DEFAULT_LIST_FILTERS)
  const [query, setQuery] = useState("")
  const filters: ListFilters = { ...storedFilters, query }

  function setFilter<K extends keyof ListFilters>(key: K, value: ListFilters[K]) {
    if (key === "query") {
      setQuery(value as string)
      return
    }
    writeStoredFilters({ ...filters, [key]: value })
  }

  function clearFilters() {
    setQuery("")
    writeStoredFilters(DEFAULT_LIST_FILTERS)
  }

  const [view, setView] = useState<"list" | "board" | "week" | "panorama" | "historico">("list")
  // Persistido (ver subscribeShowDone acima) — sem isso, o toggle resetava a
  // cada visita e as concluídas pareciam ter sumido de vez.
  const showDone = useSyncExternalStore(subscribeShowDone, readStoredShowDone, () => false)
  const setShowDone = (next: boolean | ((prev: boolean) => boolean)) =>
    writeStoredShowDone(typeof next === "function" ? next(showDone) : next)
  const [showSnoozed, setShowSnoozed] = useState(false)
  // Mobile: filtros recolhidos num botão "Filtros" (no desktop ficam sempre visíveis).
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  // Histórico (view "Histórico") — carregado ao entrar na aba, não é mais um
  // toggle manual: é a biblioteca de processos resolvidos, então deve aparecer
  // sozinha assim que o usuário pede pra ver, sem um clique extra em "Arquivadas".
  const [archived, setArchived] = useState<TaskRow[] | null>(null)
  const [archivedPending, startArchivedTransition] = useTransition()
  const archivedLoadedRef = useRef(false)
  // Resync durante o render (mesmo padrão do `prevInitial` acima) em vez de
  // useEffect: entra na aba Histórico → dispara a carga; sai dela → descarrega,
  // para a próxima entrada trazer tarefas recém-arquivadas nesse meio-tempo.
  const prevViewRef = useRef(view)
  if (prevViewRef.current !== view) {
    prevViewRef.current = view
    if (view !== "historico") {
      archivedLoadedRef.current = false
      setArchived(null)
    } else if (!archivedLoadedRef.current) {
      archivedLoadedRef.current = true
      startArchivedTransition(async () => {
        try {
          // Painel embutido na página de uma clínica (defaultClinicId setado):
          // histórico recorta pra ela só, senão viraria o histórico de todas
          // as clínicas da carteira e pareceria ter ido parar em /tarefas.
          setArchived(await listArchivedTasks(1000, defaultClinicId ?? undefined))
        } catch {
          archivedLoadedRef.current = false
          toast.error("Falha ao carregar histórico.")
        }
      })
    }
  }

  function restore(id: string) {
    startArchivedTransition(async () => {
      const res = await unarchiveTask(id)
      if (res.ok) {
        setArchived((prev) => prev?.filter((t) => t.id !== id) ?? null)
        toast.success("Tarefa restaurada.")
        refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const categoryLabel = Object.fromEntries(categories.map((c) => [c.slug, c.label]))
  // Inclui categorias desativadas que ainda aparecem em alguma tarefa, senão o filtro não acha elas.
  const filterCategories = [
    ...categories,
    ...Array.from(new Set(tasks.map((t) => t.category)))
      .filter((slug) => !categories.some((c) => c.slug === slug))
      .map((slug) => ({ id: slug, slug, label: slug, position: 999, active: false })),
  ]

  function refresh() {
    router.refresh()
  }

  function changeStatus(id: string, status: TaskStatus) {
    // Move na hora (otimista); só re-busca se o servidor recusar.
    const current = tasks.find((t) => t.id === id)
    const prev = current?.status
    const title = current?.title
    const snapshot = tasks
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id
          ? { ...t, status, completed_at: status === "concluida" ? new Date().toISOString() : null }
          : t,
      ),
    )
    startTransition(async () => {
      const res = await updateTaskStatus(id, status)
      if (!res.ok) {
        setTasks(snapshot)
        toast.error(res.error)
        return
      }
      // Feedback claro: o que aconteceu + desfazer (a ação some da vista quando
      // conclui/descarta com o filtro ligado, então o toast é a confirmação).
      toast.success(STATUS_TOAST[status], {
        description: title,
        action:
          prev && prev !== status
            ? { label: "Desfazer", onClick: () => changeStatus(id, prev) }
            : undefined,
      })
    })
  }

  // Aplica o adiamento sem toast (usado tanto pela ação quanto pelo "Desfazer").
  function applySnooze(id: string, until: string | null) {
    const snapshot = tasks
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, snoozed_until: until } : t)))
    startTransition(async () => {
      const res = await snoozeTask(id, until)
      if (!res.ok) {
        setTasks(snapshot)
        toast.error(res.error)
      }
    })
  }

  function snooze(id: string, until: string | null) {
    const current = tasks.find((t) => t.id === id)
    const prev = current?.snoozed_until ?? null
    applySnooze(id, until)
    // A tarefa some da vista — o toast narra pra onde foi e deixa desfazer.
    if (until) {
      toast.success(`Adiada para ${fmtSnoozeDate(until, today)}`, {
        description: current?.title,
        action: { label: "Desfazer", onClick: () => applySnooze(id, prev) },
      })
    } else {
      toast.success("Adiamento removido", { description: current?.title })
    }
  }

  // Aplica o fixar/soltar sem toast (usado pela ação e pelo "Desfazer").
  function applyPin(id: string, pinnedAt: string | null) {
    const snapshot = tasks
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, pinned_at: pinnedAt } : t)))
    startTransition(async () => {
      const res = await pinTask(id, pinnedAt != null)
      if (!res.ok) {
        setTasks(snapshot)
        toast.error(res.error)
        return
      }
      // Carimbo real do servidor (a ordem do bloco "Em foco" usa pinned_at).
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, pinned_at: res.pinnedAt } : t)))
    })
  }

  function pin(id: string, pinned: boolean) {
    const current = tasks.find((t) => t.id === id)
    const prev = current?.pinned_at ?? null
    applyPin(id, pinned ? new Date().toISOString() : null)
    // A tarefa muda de lugar na tela — o toast narra pra onde foi e deixa desfazer.
    toast.success(pinned ? "Fixada em foco" : "Removida do foco", {
      description: current?.title,
      action: { label: "Desfazer", onClick: () => applyPin(id, prev) },
    })
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Excluir tarefa?",
      description: "A tarefa é removida em definitivo — não vai para as arquivadas e não dá para recuperar.",
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    // Otimista: some da lista/board na hora; só re-insere se o servidor recusar.
    const title = tasks.find((t) => t.id === id)?.title
    const snapshot = tasks
    setTasks((ts) => ts.filter((t) => t.id !== id))
    startTransition(async () => {
      const res = await deleteTask(id)
      if (res.ok) {
        toast.success("Tarefa excluída", { description: title })
      } else {
        setTasks(snapshot)
        toast.error(res.error)
      }
    })
  }

  // Alterna a seleção de uma tarefa. Com Shift, seleciona o intervalo da âncora
  // (última clicada sem Shift) até esta, na ordem exibida — como em
  // gerenciadores de arquivos/e-mail. Sem Shift, alterna só a clicada e vira a
  // nova âncora. Lê a ordem de `orderedIdsRef` (mesma da lista renderizada).
  function toggleSelect(id: string, shiftKey = false) {
    if (shiftKey && anchorId && anchorId !== id) {
      const ids = orderedIdsRef.current
      const a = ids.indexOf(anchorId)
      const b = ids.indexOf(id)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelected((prev) => {
          const next = new Set(prev)
          for (const rid of ids.slice(lo, hi + 1)) next.add(rid)
          return next
        })
        setAnchorId(id)
        return
      }
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setAnchorId(id)
  }

  function bulkStatus(status: TaskStatus) {
    const ids = [...selected]
    if (!ids.length) return
    const idSet = selected
    const snapshot = tasks
    // Otimista: aplica o novo status nas selecionadas na hora.
    setTasks((ts) =>
      ts.map((t) =>
        idSet.has(t.id)
          ? { ...t, status, completed_at: status === "concluida" ? new Date().toISOString() : null }
          : t,
      ),
    )
    setSelected(new Set())
    startTransition(async () => {
      const res = await bulkUpdateTaskStatus(ids, status)
      if (res.ok) {
        toast.success(
          status === "concluida"
            ? `${res.count} tarefa(s) concluída(s).`
            : `${res.count} tarefa(s) descartada(s).`,
        )
      } else {
        setTasks(snapshot)
        setSelected(idSet)
        toast.error(res.error)
      }
    })
  }

  // Na Lista, esconde concluídas/canceladas por padrão (a menos que o usuário
  // ligue "Mostrar concluídas" ou filtre explicitamente por um status). No Board
  // as colunas Concluída/Cancelada continuam visíveis.
  const { today, endOfWeek } = spDateParts(new Date())
  const isSnoozedActive = (t: TaskRow) => t.snoozed_until != null && t.snoozed_until > today
  const snoozedCount = tasks.filter(isSnoozedActive).length
  const isPinned = (t: TaskRow) => t.pinned_at != null
  // Adiar vence Fixar: "adiar" é "não quero ver isso agora", ponto final — uma
  // tarefa fixada e adiada some da vista (inclusive do bloco "Em foco") até a
  // data voltar, exatamente como qualquer outra tarefa adiada.
  const hiddenBySnooze = (t: TaskRow) => isSnoozedActive(t)

  const activeFilters = activeFilterCount(filters)
  // A busca tem campo próprio na barra, então o "(N)" do botão conta só o painel.
  const activePanelFilters = activeFilterCount({ ...filters, query: "" })
  const hideDone = (view === "list" || view === "board") && !showDone && filters.status === ALL
  const filtered = tasks
    .filter((t) => showSnoozed || !hiddenBySnooze(t))
    .filter((t) => !(hideDone && DONE_STATUSES.has(t.status)))
    .filter((t) => matchesFilters(t, filters, today, endOfWeek))
    .sort((a, b) => {
      const doneRank = (s: TaskStatus) => (DONE_STATUSES.has(s) ? 1 : 0)
      const doneDiff = doneRank(a.status) - doneRank(b.status)
      if (doneDiff !== 0) return doneDiff
      const prDiff = TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority]
      if (prDiff !== 0) return prDiff
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date < b.due_date ? -1 : 1
    })
  // Histórico: mesma busca/filtros da Lista, aplicados sobre o arquivo em vez
  // das tarefas ativas — é a mesma barra, só que aponta pra outra fonte.
  const archivedFiltered = (archived ?? [])
    .filter((t) => matchesFilters(t, filters, today, endOfWeek))
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))

  // ── "Em foco": as fixadas saem da lista principal e viram um bloco no topo ──
  // Ordena pela fixação mais recente (acabei de fixar → topo do bloco).
  const pinnedTasks = filtered
    .filter(isPinned)
    .sort((a, b) => (a.pinned_at! < b.pinned_at! ? 1 : -1))
  const restTasks = filtered.filter((t) => !isPinned(t))
  // Mantém a ordem visível disponível para o Shift+clique (seleção em intervalo)
  // — inclui o bloco "Em foco", que é renderizado antes da lista.
  orderedIdsRef.current = [...pinnedTasks, ...restTasks].map((t) => t.id)

  // ── Agenda "Minha semana": só as minhas tarefas abertas, agrupadas por prazo ──
  const myOpenTasks = tasks.filter(
    (t) => t.assigned_to === currentUserId && !DONE_STATUSES.has(t.status) && (showSnoozed || !hiddenBySnooze(t)),
  )
  // As fixadas também sobem para um bloco próprio aqui (mesma leitura da Lista).
  const myPinned = myOpenTasks
    .filter(isPinned)
    .sort((a, b) => (a.pinned_at! < b.pinned_at! ? 1 : -1))
  const weekGroups = new Map<AgendaBucket, TaskRow[]>(AGENDA_ORDER.map((b) => [b, []]))
  for (const t of myOpenTasks) {
    if (isPinned(t)) continue
    weekGroups.get(agendaBucket(t.due_date, today, endOfWeek))!.push(t)
  }
  for (const list of weekGroups.values()) {
    list.sort((a, b) => {
      if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
      return TASK_PRIORITY_RANK[b.priority] - TASK_PRIORITY_RANK[a.priority]
    })
  }

  // Um campo do painel de filtros: rótulo miúdo em cima, controle embaixo.
  // O mesmo gatilho serve aos 8 selects (elemento React é imutável, reusar é ok).
  const filterTrigger = (
    <SelectTrigger className="h-9 w-full text-sm sm:h-8">
      <SelectValue />
    </SelectTrigger>
  )
  function filterField(label: string, control: React.ReactNode) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {control}
      </div>
    )
  }

  // Bloco "Em foco" — o que está fixado, no topo da Lista e da Minha Semana.
  // Some se a tarefa for adiada (adiar vence fixar — ver hiddenBySnooze); ao
  // soltar o foco, ela volta pro lugar normal na hora (otimista) e o bloco
  // some quando esvazia.
  function focusBlock(items: TaskRow[], selectable: boolean) {
    if (!items.length) return null
    return (
      <div className="rounded-lg border border-brand/25 bg-brand/[0.04] p-2.5 sm:p-3">
        <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
          <Target className="size-3.5" />
          Em foco
          <span className="tabular-nums text-[0.68rem] font-normal text-muted-foreground/70">{items.length}</span>
        </h3>
        <ul className="flex flex-col gap-2 sm:gap-0 sm:divide-y sm:divide-border/40">
          {items.map((t) => (
            <TaskListItem
              key={t.id}
              t={t}
              categoryLabel={categoryLabel}
              pending={pending}
              today={today}
              onOpen={setOpenTaskId}
              onChangeStatus={changeStatus}
              onRemove={remove}
              onSnooze={snooze}
              onPin={pin}
              selectable={selectable}
              selected={selected.has(t.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </ul>
      </div>
    )
  }

  // Busca e painel de filtros também valem no Histórico (achar uma tarefa
  // resolvida meses atrás é o motivo da aba existir). A Semana é a agenda
  // pessoal e o Panorama tem recortes próprios — nenhum dos dois usa busca.
  const showFilterBar = view === "list" || view === "board" || view === "historico"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Busca livre — sempre visível: é o filtro mais usado no dia a dia */}
        {showFilterBar && (
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.query}
              onChange={(e) => setFilter("query", e.target.value)}
              placeholder="Buscar tarefa, clínica, responsável…"
              aria-label="Buscar tarefas"
              className="h-9 pl-8 pr-8 text-sm sm:h-8"
            />
            {filters.query && (
              <button
                type="button"
                onClick={() => setFilter("query", "")}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Um único gatilho para o painel (antes os selects ficavam inline no
            desktop): com 8 recortes, inline estourava a barra. */}
        {showFilterBar && (
          <Button
            type="button"
            size="sm"
            variant={filtersOpen || activePanelFilters > 0 ? "secondary" : "outline"}
            className="h-9 sm:h-8"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            title="Filtrar por status, clínica, responsável, prazo…"
          >
            <SlidersHorizontal className="size-3.5" />
            Filtros
            {activePanelFilters > 0 && ` (${activePanelFilters})`}
          </Button>
        )}

        {(view === "list" || view === "board") && (
          <Button
            type="button"
            size="sm"
            variant={showDone ? "secondary" : "outline"}
            onClick={() => setShowDone((v) => !v)}
            title={showDone ? "Ocultar concluídas e canceladas" : "Mostrar concluídas e canceladas"}
          >
            {showDone ? "Ocultar concluídas" : "Mostrar concluídas"}
          </Button>
        )}

        {snoozedCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant={showSnoozed ? "secondary" : "outline"}
            onClick={() => setShowSnoozed((v) => !v)}
            title={showSnoozed ? "Ocultar tarefas adiadas" : "Mostrar tarefas adiadas"}
          >
            <Clock className="size-3.5" />
            {showSnoozed ? "Ocultar adiadas" : `Adiadas (${snoozedCount})`}
          </Button>
        )}

        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            title="Ver como lista"
            className="size-9 sm:size-7"
            onClick={() => setView("list")}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "board" ? "secondary" : "ghost"}
            title="Ver como board"
            className="size-9 sm:size-7"
            onClick={() => setView("board")}
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "week" ? "secondary" : "ghost"}
            title="Ver minha semana"
            className="size-9 sm:size-7"
            onClick={() => setView("week")}
          >
            <CalendarDays className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "panorama" ? "secondary" : "ghost"}
            title="Ver panorama"
            className="size-9 sm:size-7"
            onClick={() => setView("panorama")}
          >
            <BarChart3 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "historico" ? "secondary" : "ghost"}
            title="Ver histórico (tarefas concluídas/canceladas arquivadas)"
            className="size-9 sm:size-7"
            onClick={() => setView("historico")}
          >
            <Archive className="size-3.5" />
          </Button>
        </div>

        <div className="flex-1" />
        <GenerateSuggestionsButton initialJobs={suggestionJobs} onGenerated={refresh} />
        <RecurrencesDialog
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          isGestor={isGestor}
          onChanged={refresh}
        />
        <CreateTaskDialog
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          defaultClinicId={defaultClinicId}
          currentUserId={currentUserId}
          onCreated={refresh}
        />
      </div>

      {/* Painel de filtros — recolhido por padrão, empilha no mobile. Os valores
          ficam no localStorage, então voltar na página mantém o recorte. */}
      {showFilterBar && filtersOpen && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-accent/10 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {filterField(
            "Status",
            <Select
              value={filters.status}
              items={{ [ALL]: "Todos", ...Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABEL[s]])) }}
              onValueChange={(v) => setFilter("status", v ?? ALL)}
            >
              {filterTrigger}
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {filterField(
            "Categoria",
            <Select
              value={filters.category}
              items={{ [ALL]: "Todas", ...Object.fromEntries(filterCategories.map((c) => [c.slug, c.label])) }}
              onValueChange={(v) => setFilter("category", v ?? ALL)}
            >
              {filterTrigger}
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {filterCategories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {filterField(
            "Prioridade",
            <Select
              value={filters.priority}
              items={{ [ALL]: "Todas", ...Object.fromEntries(TASK_PRIORITIES.map((p) => [p, TASK_PRIORITY_LABEL[p]])) }}
              onValueChange={(v) => setFilter("priority", v ?? ALL)}
            >
              {filterTrigger}
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {filterField(
            "Clínica",
            <Select
              value={filters.clinic}
              items={{
                [ALL]: "Todas",
                [NONE]: "Sem clínica (interna)",
                ...Object.fromEntries(clinics.map((c) => [c.id, c.name])),
              }}
              onValueChange={(v) => setFilter("clinic", v ?? ALL)}
            >
              {filterTrigger}
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                <SelectItem value={NONE}>Sem clínica (interna)</SelectItem>
                {clinics.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {filterField(
            "Responsável",
            <Select
              value={filters.assignee}
              items={{
                [ALL]: "Qualquer um",
                [NONE]: "Sem responsável",
                ...Object.fromEntries(profiles.map((p) => [p.id, profileLabel(p)])),
              }}
              onValueChange={(v) => setFilter("assignee", v ?? ALL)}
            >
              {filterTrigger}
              <SelectContent>
                <SelectItem value={ALL}>Qualquer um</SelectItem>
                <SelectItem value={NONE}>Sem responsável</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {profileLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {filterField(
            "Prazo",
            <Select
              value={filters.due}
              items={DUE_LABEL}
              onValueChange={(v) => setFilter("due", (v as DueFilter | null) ?? "all")}
            >
              {filterTrigger}
              <SelectContent>
                {(Object.keys(DUE_LABEL) as DueFilter[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DUE_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {filterField(
            "Origem",
            <Select
              value={filters.source}
              items={SOURCE_LABEL}
              onValueChange={(v) => setFilter("source", (v as SourceFilter | null) ?? "all")}
            >
              {filterTrigger}
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as SourceFilter[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {filterField(
            "Tipo",
            <Select
              value={filters.marker}
              items={MARKER_LABEL}
              onValueChange={(v) => setFilter("marker", (v as MarkerFilter | null) ?? "all")}
            >
              {filterTrigger}
              <SelectContent>
                {(Object.keys(MARKER_LABEL) as MarkerFilter[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MARKER_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}

          {activeFilters > 0 && (
            <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground">
                {view === "historico"
                  ? `${archivedFiltered.length} de ${archived?.length ?? 0} tarefa${(archived?.length ?? 0) !== 1 ? "s" : ""} no recorte atual`
                  : `${filtered.length} de ${tasks.length} tarefa${tasks.length !== 1 ? "s" : ""} no recorte atual`}
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                <FilterX className="size-3.5" />
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      )}
      </div>

      {view === "panorama" ? (
        <TaskDashboard
          tasks={tasks}
          categoryLabel={categoryLabel}
          profiles={profiles}
          clinics={clinics}
          isGestor={isGestor}
          currentUserId={currentUserId}
          onOpenTask={setOpenTaskId}
        />
      ) : view === "historico" ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Biblioteca de tarefas concluídas e canceladas — seguem no banco (nada é apagado); use a busca e os
            filtros acima para achar como um processo antigo foi resolvido.
          </p>
          {archivedPending && archived === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando histórico…</p>
          ) : archivedFiltered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {(archived?.length ?? 0) > 0
                ? "Nenhuma tarefa no recorte atual."
                : "Nenhuma tarefa arquivada ainda."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {archivedFiltered.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setOpenTaskId(t.id)}
                      className="block truncate text-left text-sm text-muted-foreground line-through hover:text-foreground"
                    >
                      {t.title}
                    </button>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground/70">
                      <span className="rounded bg-accent/50 px-1.5 py-0.5">{categoryLabel[t.category] ?? t.category}</span>
                      {t.clinic_id && t.clinic_name && (
                        <>
                          ·{" "}
                          <Link href={`/clinicas/${t.clinic_id}`} className="hover:text-foreground transition-colors">
                            {t.clinic_name}
                          </Link>
                        </>
                      )}
                      {t.assigned_to_name && <>· {t.assigned_to_name}</>}
                      {t.completed_at && (
                        <>
                          ·{" "}
                          {t.status === "cancelada" ? "cancelada" : "concluída"} em{" "}
                          {new Date(t.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={archivedPending}
                    onClick={() => restore(t.id)}
                  >
                    <RotateCcw className="size-3.5" />
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : view === "week" ? (
        myOpenTasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Você não tem tarefas em aberto atribuídas a você.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {focusBlock(myPinned, false)}
            {AGENDA_ORDER.map((bucket) => {
              const items = weekGroups.get(bucket)!
              if (!items.length) return null
              return (
                <div key={bucket}>
                  <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className={bucket === "atrasada" ? "text-red-400" : undefined}>
                      {AGENDA_LABEL[bucket]}
                    </span>
                    <span className="tabular-nums text-[0.68rem] text-muted-foreground/70">{items.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-2 sm:gap-0 sm:divide-y sm:divide-border/40">
                    {items.map((t) => (
                      <TaskListItem
                        key={t.id}
                        t={t}
                        categoryLabel={categoryLabel}
                        pending={pending}
                        today={today}
                        onOpen={setOpenTaskId}
                        onChangeStatus={changeStatus}
                        onRemove={remove}
                        onSnooze={snooze}
                        onPin={pin}
                      />
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-center text-sm text-muted-foreground">
            {activeFilters > 0
              ? `Nenhuma tarefa no recorte atual (${tasks.length} no total).`
              : "Nenhuma tarefa por aqui."}
          </p>
          {activeFilters > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              <FilterX className="size-3.5" />
              Limpar filtros
            </Button>
          )}
        </div>
      ) : view === "board" ? (
        <KanbanBoard tasks={filtered} categoryLabel={categoryLabel} onOpen={setOpenTaskId} onStatusChange={changeStatus} />
      ) : (
        <div className="flex flex-col gap-3">
          {focusBlock(pinnedTasks, true)}

          {/* Cabeçalho de seleção + barra de ação em lote (desktop; no mobile a
              seleção múltipla sai de cena — ações item a item ou pelo detalhe) */}
          <div className="hidden flex-wrap items-center gap-3 border-b border-border/40 pb-2 sm:flex">
            <Checkbox
              checked={filtered.length > 0 && filtered.every((t) => selected.has(t.id))}
              onCheckedChange={(checked) => {
                setSelected(checked ? new Set(filtered.map((t) => t.id)) : new Set())
                setAnchorId(null)
              }}
              aria-label="Selecionar todas"
            />
            {selected.size > 0 ? (
              <>
                <span className="text-xs font-medium text-muted-foreground">
                  {selected.size} selecionada{selected.size !== 1 ? "s" : ""}
                </span>
                <div className="flex-1" />
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => bulkStatus("concluida")}>
                  Concluir ({selected.size})
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => bulkStatus("cancelada")}>
                  Descartar ({selected.size})
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Selecione tarefas para concluir ou descartar em lote · Shift+clique seleciona um intervalo</span>
            )}
          </div>

          <ul className="flex flex-col gap-2 sm:gap-0 sm:divide-y sm:divide-border/40">
            {restTasks.map((t) => (
              <TaskListItem
                key={t.id}
                t={t}
                categoryLabel={categoryLabel}
                pending={pending}
                today={today}
                onOpen={setOpenTaskId}
                onChangeStatus={changeStatus}
                onRemove={remove}
                onSnooze={snooze}
                onPin={pin}
                selectable
                selected={selected.has(t.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && view !== "panorama" && view !== "historico" && (
        <TaskSuggestions
          suggestions={suggestions}
          clinics={clinics}
          profiles={profiles}
          categories={categories}
          currentUserId={currentUserId}
          onChanged={refresh}
        />
      )}

      <TaskDetailDialog
        taskId={openTaskId}
        clinics={clinics}
        profiles={profiles}
        categories={categories}
        onClose={() => setOpenTaskId(null)}
        onStatusChange={changeStatus}
        onDeleted={(id) => setTasks((ts) => ts.filter((t) => t.id !== id))}
        onPinned={(id, pinnedAt) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, pinned_at: pinnedAt } : t)))}
        onChanged={refresh}
        currentUserId={currentUserId}
      />
    </div>
  )
}
