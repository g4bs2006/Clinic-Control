// Motor de clusters de tarefas — lógica PURA (sem I/O), com duas lentes:
//   1) detector de rotinas: cadência regular DENTRO de um cluster (mesma clínica)
//      → candidata a regra recorrente;
//   2) diagnóstico pós-onboarding: incidência de um cluster ENTRE clínicas novas
//      → etapa fraca do processo de implantação.
// Similaridade por trigramas (mesma família do pg_trgm usado no dedup).

export type ClusterItem = {
  id: string;
  title: string;
  clinicId: string | null;
  /** YYYY-MM-DD (criação). */
  day: string;
};

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Similaridade Jaccard de trigramas (0..1) sobre títulos normalizados. */
export function similarity(a: string, b: string): number {
  const ta = trigrams(normalizeTitle(a));
  const tb = trigrams(normalizeTitle(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export type Cluster = {
  /** Título "central" do cluster (o mais frequente/médio). */
  medoid: string;
  items: ClusterItem[];
};

/**
 * Clustering ganancioso (single-linkage): o item entra no cluster com o membro
 * mais similar acima do limiar; senão abre cluster novo. O(n²) no pior caso —
 * adequado ao volume (centenas de tarefas). Medido em dados reais: sinônimos
 * operacionais ("ajustar/corrigir etiquetas do painel") ficam em ~0.42;
 * não-relacionados em <0.1 — margem folgada para os limiares 0.4/0.5.
 */
export function greedyClusters(items: ClusterItem[], threshold = 0.5): Cluster[] {
  const clusters: Cluster[] = [];
  for (const item of items) {
    let best: Cluster | null = null;
    let bestSim = threshold;
    for (const c of clusters) {
      for (const member of c.items) {
        const s = similarity(item.title, member.title);
        if (s >= bestSim) {
          best = c;
          bestSim = s;
        }
      }
    }
    if (best) {
      best.items.push(item);
      // medoid = título do item mais próximo do "meio" — aproximação barata:
      // mantém o título mais CURTO (títulos limpos tendem a ser os canônicos).
      if (item.title.length < best.medoid.length) best.medoid = item.title;
    } else {
      clusters.push({ medoid: item.title, items: [item] });
    }
  }
  return clusters;
}

// ── Lente 1: cadência ────────────────────────────────────────────────────────

export type Cadence = {
  freq: "diaria" | "semanal" | "mensal";
  medianGapDays: number;
  occurrences: number;
};

const DAY_MS = 86_400_000;

/**
 * Detecta ritmo num conjunto de datas: ≥3 ocorrências (em dias DISTINTOS) com
 * intervalos regulares (dentro de ±35% da mediana) e mediana mapeável para
 * diária (~1d), semanal (5–10d) ou mensal (25–35d). Null = sem ritmo confiável.
 */
export function detectCadence(days: string[]): Cadence | null {
  const uniq = [...new Set(days)].sort();
  if (uniq.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < uniq.length; i++) {
    gaps.push(Math.round((Date.parse(uniq[i]) - Date.parse(uniq[i - 1])) / DAY_MS));
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return null;

  const regular = gaps.every((g) => Math.abs(g - median) <= Math.max(1, median * 0.35));
  if (!regular) return null;

  let freq: Cadence["freq"] | null = null;
  if (median <= 2) freq = "diaria";
  else if (median >= 5 && median <= 10) freq = "semanal";
  else if (median >= 25 && median <= 35) freq = "mensal";
  if (!freq) return null;

  return { freq, medianGapDays: median, occurrences: uniq.length };
}

export type RoutineCandidate = {
  clinicId: string | null;
  title: string;
  cadence: Cadence;
  lastDay: string;
  signature: string;
};

/** Assinatura estável do cluster (memória de rejeição do detector). */
export function clusterSignature(clinicId: string | null, medoid: string): string {
  return `${clinicId ?? "interna"}|${normalizeTitle(medoid)}`;
}

/**
 * Lente 1 — rotinas: clusters POR CLÍNICA com cadência regular e atividade
 * recente (última ocorrência dentro de 2× o intervalo mediano).
 */
export function detectRoutines(items: ClusterItem[], today: string, threshold = 0.5): RoutineCandidate[] {
  const byClinic = new Map<string, ClusterItem[]>();
  for (const it of items) {
    const key = it.clinicId ?? "interna";
    const arr = byClinic.get(key) ?? [];
    arr.push(it);
    byClinic.set(key, arr);
  }

  const out: RoutineCandidate[] = [];
  for (const arr of byClinic.values()) {
    for (const cluster of greedyClusters(arr, threshold)) {
      const cadence = detectCadence(cluster.items.map((i) => i.day));
      if (!cadence) continue;
      const lastDay = cluster.items.map((i) => i.day).sort().at(-1)!;
      const staleDays = Math.round((Date.parse(today) - Date.parse(lastDay)) / DAY_MS);
      if (staleDays > cadence.medianGapDays * 2) continue; // ritmo morto — não sugere
      const clinicId = cluster.items[0].clinicId;
      out.push({
        clinicId,
        title: cluster.medoid,
        cadence,
        lastDay,
        signature: clusterSignature(clinicId, cluster.medoid),
      });
    }
  }
  return out.sort((a, b) => b.cadence.occurrences - a.cadence.occurrences);
}

// ── Lente 2: diagnóstico pós-onboarding ─────────────────────────────────────

export type OnboardingItem = ClusterItem & {
  /** Dia de vida da clínica em que a tarefa nasceu (0 = dia do onboarding). */
  dayOfLife: number;
};

export type OnboardingTheme = {
  title: string;
  clinicsCount: number;
  clinicIds: string[];
  /** Janela típica (dias de vida) em que o tema aparece. */
  dayRange: [number, number];
  examples: string[];
};

/**
 * Lente 2 — temas pós-onboarding: clusters GLOBAIS (entre clínicas) das tarefas
 * criadas na janela crítica. Só interessa o que se repete em ≥2 clínicas — isso
 * é defeito de processo, não caso isolado.
 */
export function onboardingThemes(items: OnboardingItem[], threshold = 0.4): OnboardingTheme[] {
  const clusters = greedyClusters(items, threshold);
  const out: OnboardingTheme[] = [];
  for (const c of clusters) {
    const clinicIds = [...new Set(c.items.map((i) => i.clinicId).filter((x): x is string => !!x))];
    if (clinicIds.length < 2) continue;
    const daysOfLife = (c.items as OnboardingItem[]).map((i) => i.dayOfLife).sort((a, b) => a - b);
    out.push({
      title: c.medoid,
      clinicsCount: clinicIds.length,
      clinicIds,
      dayRange: [daysOfLife[0], daysOfLife.at(-1)!],
      examples: [...new Set(c.items.map((i) => i.title))].slice(0, 3),
    });
  }
  return out.sort((a, b) => b.clinicsCount - a.clinicsCount);
}
