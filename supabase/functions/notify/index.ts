// Edge Function: relatórios por WhatsApp (Evolution/contactia) via pg_cron.
//   ?type=manha     → pendências da carteira (o que falta fazer)  [9h BRT]
//   ?type=noite     → o que aconteceu no dia                       [19h BRT]
//   ?type=contencao → conversas concluídas automaticamente por gasto de IA
//                     (event-driven: chamado pelo Next ao fim da fila de
//                      contenção, não pelo cron)
// Envia para NOTIFY_RECIPIENTS (número(s) ou JID de grupo, separados por vírgula),
// com a mensagem agrupada por carteira (dev responsável).
//
// Secrets: CRON_SECRET, NOTIFY_API_URL, NOTIFY_API_KEY, NOTIFY_INSTANCE,
//   NOTIFY_RECIPIENTS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCHEMA = "clinic_control";
const CRON_SECRET = (Deno.env.get("CRON_SECRET") ?? "").trim();
const API_URL = (Deno.env.get("NOTIFY_API_URL") ?? "").trim().replace(/\/+$/, "");
const API_KEY = (Deno.env.get("NOTIFY_API_KEY") ?? "").trim();
const INSTANCE = (Deno.env.get("NOTIFY_INSTANCE") ?? "").trim();
const RECIPIENTS = (Deno.env.get("NOTIFY_RECIPIENTS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function ddmm(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}`;
}

async function sendText(number: string, text: string) {
  const res = await fetch(`${API_URL}/message/sendText/${encodeURIComponent(INSTANCE)}`, {
    method: "POST",
    headers: { apikey: API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) throw new Error(`sendText ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

type Clinic = { id: string; name: string; developer_id: string | null };

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!API_URL || !API_KEY || !INSTANCE || !RECIPIENTS.length) {
    return Response.json({ ok: false, error: "NOTIFY_* secrets ausentes (URL/KEY/INSTANCE/RECIPIENTS)" }, { status: 500 });
  }

  const url = new URL(req.url);
  const rawType = url.searchParams.get("type");
  const type = rawType === "noite" || rawType === "contencao" ? rawType : "manha";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = todaySP();
  const dayStart = `${today}T00:00:00-03:00`;
  const dayEnd = `${today}T23:59:59.999-03:00`;

  // Índices: clínica → dev, e nomes de dev.
  const [{ data: clinicRows }, { data: userRows }] = await Promise.all([
    supabase.from("clinics").select("id, name, developer_id"),
    supabase.from("app_users").select("id, name"),
  ]);
  const clinics = new Map<string, Clinic>((clinicRows ?? []).map((c) => [c.id as string, c as Clinic]));
  const devName = new Map<string, string>((userRows ?? []).map((u) => [u.id as string, (u.name as string) ?? "—"]));
  const carteiraOf = (clinicId: string | null, assignedTo: string | null): string => {
    const dev = (clinicId ? clinics.get(clinicId)?.developer_id : null) ?? assignedTo ?? null;
    return dev ? (devName.get(dev) ?? "Sem carteira") : "Sem carteira / interna";
  };

  let text = "";

  if (type === "manha") {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, status, priority, due_date, clinic_id, assigned_to")
      .is("parent_task_id", null)
      .is("archived_at", null)
      .in("status", ["pendente", "em_andamento"]);

    const { data: acomps } = await supabase
      .from("acompanhamentos")
      .select("clinic_id, assigned_to")
      .eq("status", "aberto");

    const { count: pendingSuggestions } = await supabase
      .from("task_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    // agrupa por carteira
    type Bucket = { overdue: string[]; urgent: string[]; total: number; acomp: number };
    const byDev = new Map<string, Bucket>();
    const bucket = (k: string) => {
      let b = byDev.get(k);
      if (!b) { b = { overdue: [], urgent: [], total: 0, acomp: 0 }; byDev.set(k, b); }
      return b;
    };
    for (const t of tasks ?? []) {
      const b = bucket(carteiraOf(t.clinic_id as string | null, t.assigned_to as string | null));
      b.total++;
      const clinicName = t.clinic_id ? clinics.get(t.clinic_id as string)?.name : null;
      const label = clinicName ? `${t.title} — ${clinicName}` : (t.title as string);
      const overdue = t.due_date && (t.due_date as string) < today;
      if (overdue) b.overdue.push(label);
      else if (t.priority === "urgente") b.urgent.push(label);
    }
    for (const a of acomps ?? []) {
      bucket(carteiraOf(a.clinic_id as string | null, a.assigned_to as string | null)).acomp++;
    }

    const lines = [`☀️ *Bom dia! Pendências da carteira* — ${ddmm(today)}`, ""];
    const devs = [...byDev.entries()].sort((a, b) => b[1].total - a[1].total);
    if (!devs.length) {
      lines.push("Nada em aberto. 🎉");
    } else {
      for (const [dev, b] of devs) {
        const head = [
          b.overdue.length ? `⚠️ ${b.overdue.length} atrasada(s)` : "",
          b.urgent.length ? `🔴 ${b.urgent.length} urgente(s)` : "",
          `${b.total} em aberto`,
          b.acomp ? `👀 ${b.acomp} acomp.` : "",
        ].filter(Boolean).join(" · ");
        lines.push(`*${dev}* — ${head}`);
        for (const l of [...b.overdue.slice(0, 4).map((x) => `  • ⚠️ ${x}`), ...b.urgent.slice(0, 3).map((x) => `  • 🔴 ${x}`)]) {
          lines.push(l);
        }
        lines.push("");
      }
    }
    if (pendingSuggestions) lines.push(`🤖 ${pendingSuggestions} sugestão(ões) da IA aguardando revisão em /tarefas.`);
    text = lines.join("\n").trim();
  } else if (type === "contencao") {
    // CONTENÇÃO — o que a automação fechou (ou teria fechado) por gasto de IA.
    // Pega os runs terminados ainda não notificados; o notified_at no fim é o
    // que impede o mesmo relatório de sair duas vezes.
    const { data: runs } = await supabase
      .from("openai_containment_runs")
      .select("id, clinic_id, day, cost_usd, status, dry_run, sessions_scanned, suspects_found, sessions_closed, error")
      .is("notified_at", null)
      .in("status", ["concluido", "erro"])
      .order("created_at");

    if (!runs?.length) {
      return Response.json({ ok: true, type, skipped: "nenhum run pendente de aviso" });
    }

    const { data: acts } = await supabase
      .from("openai_containment_actions")
      .select("run_id, contact_name, contact_phone, outcome, reason, error")
      .in("run_id", runs.map((r) => r.id as string));
    const byRun = new Map<string, Record<string, unknown>[]>();
    for (const a of acts ?? []) {
      const list = byRun.get(a.run_id as string) ?? [];
      list.push(a);
      byRun.set(a.run_id as string, list);
    }

    const usd = (v: number) => `US$ ${Number(v).toFixed(2)}`;
    const who = (a: Record<string, unknown>) =>
      [a.contact_name, a.contact_phone].filter(Boolean).join(" · ") || "(contato sem nome)";

    const lines = [`🛑 *Contenção de gasto de IA* — ${ddmm(today)}`, ""];
    for (const r of runs) {
      const clinicName = clinics.get(r.clinic_id as string)?.name ?? "Clínica";
      const dev = carteiraOf(r.clinic_id as string, null);
      lines.push(`*${clinicName}* — ${usd(r.cost_usd as number)} em ${ddmm(r.day as string)} · ${dev}`);

      if (r.status === "erro") {
        lines.push(`  ❌ Falhou: ${String(r.error ?? "erro desconhecido").slice(0, 160)}`, "");
        continue;
      }

      lines.push(
        `  ${r.sessions_scanned} conversa(s) varrida(s) · ${r.suspects_found} em loop`,
      );

      const list = byRun.get(r.id as string) ?? [];
      const fechadas = list.filter((a) => a.outcome === "concluida");
      const simuladas = list.filter((a) => a.outcome === "simulada");
      const falhas = list.filter((a) => a.outcome === "falhou");
      const poupadas = list.filter((a) => a.outcome === "poupada");

      if (r.dry_run) {
        lines.push(`  🔎 *Simulação* — contenção desligada; ${simuladas.length} conversa(s) seriam concluídas:`);
        for (const a of simuladas.slice(0, 5)) lines.push(`    • ${who(a)}`, `      ${a.reason}`);
      } else if (fechadas.length) {
        lines.push(`  ✅ ${fechadas.length} conversa(s) concluída(s) e chatbot interrompido:`);
        for (const a of fechadas.slice(0, 5)) lines.push(`    • ${who(a)}`, `      ${a.reason}`);
      } else {
        lines.push("  ✅ Nenhuma conversa bateu o critério de loop — nada foi fechado.");
      }

      if (falhas.length) {
        lines.push(`  ⚠️ ${falhas.length} não pôde(puderam) ser concluída(s):`);
        for (const a of falhas.slice(0, 3)) {
          lines.push(`    • ${who(a)} — ${String(a.error ?? "").slice(0, 100)}`);
        }
      }
      if (poupadas.length) {
        lines.push(`  ⏸️ Avaliadas e mantidas (ficaram perto do critério):`);
        for (const a of poupadas.slice(0, 3)) lines.push(`    • ${who(a)} — ${a.reason}`);
      }
      lines.push("");
    }
    lines.push("_Detalhes e histórico na aba IA & Custos da clínica._");
    text = lines.join("\n").trim();

    // Marca antes de enviar seria mais seguro contra duplicata, mas esconderia
    // uma falha de envio para sempre. Marcamos depois: no pior caso o grupo
    // recebe o mesmo relatório duas vezes, o que é melhor do que perdê-lo.
    const errors: string[] = [];
    for (const to of RECIPIENTS) {
      try {
        await sendText(to, text);
      } catch (e) {
        errors.push(`${to}: ${(e as Error).message}`);
      }
    }
    if (!errors.length) {
      await supabase
        .from("openai_containment_runs")
        .update({ notified_at: new Date().toISOString() })
        .in("id", runs.map((r) => r.id as string));
    }
    return Response.json({
      ok: errors.length === 0,
      type,
      runs: runs.length,
      recipients: RECIPIENTS.length,
      errors,
      preview: text.slice(0, 800),
    });
  } else {
    // NOITE — o que aconteceu hoje
    const [summaries, createdTasks, completedTasks, newAcomps, newSuggestions] = await Promise.all([
      supabase.from("whatsapp_daily_summaries").select("clinic_id, severity, highlights").eq("summary_date", today),
      supabase.from("tasks").select("id", { count: "exact", head: true }).gte("created_at", dayStart).lte("created_at", dayEnd),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "concluida").gte("completed_at", dayStart).lte("completed_at", dayEnd),
      supabase.from("acompanhamentos").select("id", { count: "exact", head: true }).gte("created_at", dayStart).lte("created_at", dayEnd),
      supabase.from("task_suggestions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    const attention = (summaries.data ?? [])
      .filter((s) => s.severity === "alta" || (s.highlights as { risco_churn?: boolean })?.risco_churn || ((s.highlights as { reclamacoes?: string[] })?.reclamacoes?.length ?? 0) > 0)
      .map((s) => {
        const h = s.highlights as { reclamacoes?: string[]; risco_churn?: boolean };
        const clinicName = clinics.get(s.clinic_id as string)?.name ?? "Clínica";
        const flag = s.severity === "alta" || h.risco_churn ? "🚨" : "⚠️";
        const detail = (h.reclamacoes ?? []).slice(0, 2).join("; ") || (h.risco_churn ? "risco de churn" : "sinal de atenção");
        return `  • ${flag} ${clinicName} — ${detail}`;
      });

    const lines = [`🌙 *Resumo do dia* — ${ddmm(today)}`, ""];
    if (attention.length) {
      lines.push(`*Atenção hoje* (${attention.length})`);
      lines.push(...attention.slice(0, 8));
      lines.push("");
    } else {
      lines.push("Sem sinais de atenção nos resumos de hoje. ✅", "");
    }
    lines.push(
      `✅ ${completedTasks.count ?? 0} tarefa(s) concluída(s) · ➕ ${createdTasks.count ?? 0} criada(s) hoje`,
      `👀 ${newAcomps.count ?? 0} novo(s) acompanhamento(s)`,
      `🤖 ${newSuggestions.count ?? 0} sugestão(ões) da IA na fila`,
    );
    text = lines.join("\n").trim();
  }

  // Envia a todos os destinatários.
  const errors: string[] = [];
  for (const to of RECIPIENTS) {
    try {
      await sendText(to, text);
    } catch (e) {
      errors.push(`${to}: ${(e as Error).message}`);
    }
  }

  return Response.json({ ok: errors.length === 0, type, recipients: RECIPIENTS.length, errors, preview: text.slice(0, 500) });
});
