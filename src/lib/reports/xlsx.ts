import "server-only";
import ExcelJS from "exceljs";
import type { ConversationRow, ReportStats } from "./analysis";

// Paleta portada do framework Python (Colt_analise_relatorio_junho.py)
const C = {
  hDark: "FF1A252F",
  hMid: "FF2C3E50",
  white: "FFFFFFFF",
  iaCol: "FFD6EAF8",
  humCol: "FFFADBD8",
  mixCol: "FFFEF9E7",
  agendou: "FF82E0AA",
} as const;

const ESTAGIO_COR: Record<string, string> = {
  E0: "FFF1948A",
  E1: "FFFAD7A0",
  E2: "FFF9E79F",
  E3: "FFAED6F1",
  E4: "FFA9CCE3",
  "E5.1": "FFD6EEF8",
  "E5.2": "FFF5CBA7",
  "E5.3": "FFE59866",
  "E5.4": "FF82E0AA",
  "E5.5": "FF27AE60",
  E6: "FF27AE60",
  E7: "FFD7BDE2",
  E8: "FFFDEBD0",
};

const DESCR_ESTAGIO: Record<string, string> = {
  E0: "IA não respondeu ou lead fora do escopo",
  E1: "IA realizou acolhimento e triagem",
  E2: "IA mapeou a dor do paciente — SPIN S",
  E3: "IA elevou urgência com implicações — SPIN P/I",
  E4: "IA criou desejo e micro-compromisso — SPIN N",
  "E5.1": "IA apresentou vagas, lead não avançou",
  "E5.2": "IA pediu os dados do paciente",
  "E5.3": "Lead enviou dados mas não confirmou",
  "E5.4": "Agendamento realizado (confirmado no CRM)",
  "E5.5": "Agendado pela IA com tag AGENDOU",
  E6: "Atendimento finalizado com check-out completo",
  E7: "Conversa transferida para atendente humano",
  E8: "Dúvida registrada para melhoria da base",
};

function fill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function fmtPct(v: number): string {
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function fmtPeriodo(dateStart: string, dateEnd: string): string {
  const fmt = (d: string) => d.split("-").reverse().join("/");
  return `${fmt(dateStart)} a ${fmt(dateEnd)}`;
}

function headerRow(ws: ExcelJS.Worksheet, labels: string[]) {
  const row = ws.getRow(1);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.fill = fill(C.hMid);
    cell.font = { bold: true, color: { argb: C.white }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  row.height = 28;
}

export async function buildReportXlsx(input: {
  clinicName: string;
  dateStart: string;
  dateEnd: string;
  rows: ConversationRow[];
  stats: ReportStats;
  usesDefaultKeywords: boolean;
}): Promise<Buffer> {
  const { clinicName, rows, stats } = input;
  const periodo = fmtPeriodo(input.dateStart, input.dateEnd);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Clinic Control";

  // ══ ABA 1 — RESUMO EXECUTIVO ═══════════════════════════════════════════
  const ws1 = wb.addWorksheet("Resumo Executivo");
  ws1.columns = [{ width: 34 }, { width: 52 }, { width: 18 }];

  let r = 1;
  const titulo = ws1.getCell(r, 1);
  titulo.value = `${clinicName.toUpperCase()} — ANÁLISE DO ATENDIMENTO IA | ${periodo}`;
  titulo.fill = fill(C.hDark);
  titulo.font = { bold: true, color: { argb: C.white }, size: 12 };
  ws1.mergeCells(r, 1, r, 3);
  ws1.getRow(r).height = 26;
  r += 2;

  const kv: [string, string, string?][] = [
    ["Conversas únicas (contatos)", String(stats.total)],
    ["Agendamentos (CRM real)", String(stats.agendamentos), C.agendou],
    ["Taxa de conversão", fmtPct(stats.taxaConversao), C.agendou],
    ["Taxa de engajamento", fmtPct(stats.taxaEngajamento)],
    ["Leads sem resposta", String(stats.semResposta)],
    ["Atendimentos 100% IA", String(stats.iaAutonoma), C.iaCol],
    ["Com envolvimento humano", String(stats.humanoEnvolvido), C.humCol],
    ["Transbordos", String(stats.transbordos)],
    ["Melhorias de base identificadas", String(stats.melhorias)],
  ];
  for (const [label, valor, cor] of kv) {
    ws1.getCell(r, 1).value = label;
    ws1.getCell(r, 1).font = { bold: true, size: 10 };
    const vc = ws1.getCell(r, 2);
    vc.value = valor;
    vc.font = { bold: true, size: 10 };
    if (cor) vc.fill = fill(cor);
    r++;
  }
  r++;

  const funilTitle = ws1.getCell(r, 1);
  funilTitle.value = "FUNIL DE ESTÁGIOS";
  funilTitle.fill = fill(C.hMid);
  funilTitle.font = { bold: true, color: { argb: C.white }, size: 11 };
  ws1.mergeCells(r, 1, r, 3);
  r++;
  for (const f of stats.funil) {
    ws1.getCell(r, 1).value = f.label;
    ws1.getCell(r, 1).fill = fill(ESTAGIO_COR[f.cod] ?? "FFFFFFFF");
    ws1.getCell(r, 1).font = { size: 10 };
    ws1.getCell(r, 2).value = DESCR_ESTAGIO[f.cod] ?? "";
    ws1.getCell(r, 2).font = { size: 9, color: { argb: "FF555555" } };
    ws1.getCell(r, 3).value = f.count;
    ws1.getCell(r, 3).font = { bold: true, size: 10 };
    ws1.getCell(r, 3).alignment = { horizontal: "right" };
    r++;
  }
  r++;

  const motivosTitle = ws1.getCell(r, 1);
  motivosTitle.value = "MOTIVOS DE PARADA (sem agendamento)";
  motivosTitle.fill = fill(C.hMid);
  motivosTitle.font = { bold: true, color: { argb: C.white }, size: 11 };
  ws1.mergeCells(r, 1, r, 3);
  r++;
  for (const m of stats.motivosParada) {
    ws1.getCell(r, 1).value = m.motivo;
    ws1.getCell(r, 1).font = { size: 10 };
    ws1.mergeCells(r, 1, r, 2);
    ws1.getCell(r, 3).value = m.count;
    ws1.getCell(r, 3).font = { bold: true, size: 10 };
    ws1.getCell(r, 3).alignment = { horizontal: "right" };
    r++;
  }

  if (input.usesDefaultKeywords) {
    r++;
    const aviso = ws1.getCell(r, 1);
    aviso.value =
      "⚠ Este relatório usa o conjunto padrão de palavras-chave (calibrado para o roteiro SPIN da COLT). " +
      "Ajuste os termos em Configurações para o roteiro desta clínica se o funil parecer impreciso.";
    aviso.font = { italic: true, size: 9, color: { argb: "FF8B6914" } };
    aviso.alignment = { wrapText: true, vertical: "top" };
    ws1.mergeCells(r, 1, r, 3);
    ws1.getRow(r).height = 40;
  }

  // ══ ABA 2 — CONVERSAS (1 linha por contato) ════════════════════════════
  const ws2 = wb.addWorksheet("Conversas");
  const cols2 = [
    { header: "Contato", key: "contato", width: 24 },
    { header: "Telefone", key: "telefone", width: 18 },
    { header: "Data", key: "data", width: 12 },
    { header: "Canal", key: "canal", width: 20 },
    { header: "Tipo Atendimento", key: "tipo", width: 20 },
    { header: "Humano (Nome)", key: "humano", width: 16 },
    { header: "Estágio", key: "estagio", width: 30 },
    { header: "Agendou", key: "agendou", width: 10 },
    { header: "Transbordo", key: "transbordo", width: 11 },
    { header: "Habilidades", key: "habilidades", width: 28 },
    { header: "Motivo Parada", key: "motivo", width: 44 },
    { header: "Msgs Pac.", key: "mPac", width: 9 },
    { header: "Msgs IA", key: "mIa", width: 9 },
    { header: "Msgs Hum.", key: "mHum", width: 9 },
    { header: "Resumo Paciente", key: "resumo", width: 60 },
    { header: "Última Msg IA", key: "ultimaIa", width: 50 },
    { header: "Etiquetas", key: "etiquetas", width: 22 },
    { header: "UTM Source", key: "utm", width: 14 },
  ];
  ws2.columns = cols2.map((c) => ({ key: c.key, width: c.width }));
  headerRow(ws2, cols2.map((c) => c.header));

  for (const row of rows) {
    const data = row.criadoEm
      ? new Date(row.criadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "";
    const added = ws2.addRow({
      contato: row.contato,
      telefone: row.telefone,
      data,
      canal: row.canal,
      tipo: row.tipoAtendimento,
      humano: row.humanos.join(", "),
      estagio: row.estagioLabel,
      agendou: row.agendou ? "SIM" : "NÃO",
      transbordo: row.transbordo ? "SIM" : "NÃO",
      habilidades: row.habilidades.join(" | "),
      motivo: row.motivoParada,
      mPac: row.msgsPaciente,
      mIa: row.msgsIa,
      mHum: row.msgsHumano,
      resumo: row.resumoPaciente,
      ultimaIa: row.ultimaMsgIa,
      etiquetas: row.etiquetas.join(", "),
      utm: row.utmSource,
    });
    added.font = { size: 9 };
    const estagioCell = added.getCell("estagio");
    estagioCell.fill = fill(ESTAGIO_COR[row.estagioCod] ?? "FFFFFFFF");
    if (row.agendou) added.getCell("agendou").fill = fill(C.agendou);
    const tipoCell = added.getCell("tipo");
    tipoCell.fill = fill(
      row.tipoAtendimento === "IA Autônoma"
        ? C.iaCol
        : row.tipoAtendimento === "Humano (Exclusivo)"
          ? C.humCol
          : C.mixCol,
    );
  }
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols2.length } };
  ws2.views = [{ state: "frozen", ySplit: 1 }];

  // ══ ABA 3 — FUNIL E0-E8 ════════════════════════════════════════════════
  const ws3 = wb.addWorksheet("Funil E0-E8");
  ws3.columns = [{ width: 36 }, { width: 56 }, { width: 12 }, { width: 12 }];
  headerRow(ws3, ["Estágio", "Descrição", "Conversas", "% do total"]);
  for (const f of stats.funil) {
    const added = ws3.addRow([
      f.label,
      DESCR_ESTAGIO[f.cod] ?? "",
      f.count,
      stats.total ? fmtPct(f.count / stats.total) : "0%",
    ]);
    added.font = { size: 10 };
    added.getCell(1).fill = fill(ESTAGIO_COR[f.cod] ?? "FFFFFFFF");
    added.getCell(3).alignment = { horizontal: "right" };
    added.getCell(4).alignment = { horizontal: "right" };
  }
  const totalRow = ws3.addRow(["TOTAL", "", stats.total, "100%"]);
  totalRow.font = { bold: true, size: 10 };
  totalRow.getCell(3).alignment = { horizontal: "right" };
  totalRow.getCell(4).alignment = { horizontal: "right" };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
