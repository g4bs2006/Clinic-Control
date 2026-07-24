/**
 * Extrai arquivos de imagem de um clipboard (Ctrl+V) — usado para colar prints
 * direto na área de anexos. Renomeia o print genérico do SO ("image.png") para
 * algo identificável no repositório: `print-AAAAMMDD-HHMMSS.ext`.
 *
 * Retorna [] quando não há imagem no clipboard (ex.: colar texto num campo),
 * para o chamador deixar o Ctrl+V seguir o fluxo normal.
 */
export function imageFilesFromClipboard(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  const push = (f: File | null, type: string) => {
    if (!f || !type.startsWith("image/")) return;
    out.push(new File([f], pastedImageName(type), { type }));
  };

  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      push(item.getAsFile(), item.type);
    }
  }
  // Alguns navegadores expõem via .files em vez de .items.
  if (!out.length) {
    for (const f of Array.from(dt.files ?? [])) push(f, f.type);
  }
  return out;
}

function pastedImageName(type: string): string {
  const ext = (type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `print-${stamp}.${ext}`;
}
