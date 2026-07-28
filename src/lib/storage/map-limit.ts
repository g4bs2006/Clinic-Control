/**
 * Roda `fn` sobre os itens com um teto de tarefas simultâneas, preservando a
 * ordem do resultado.
 *
 * Existe porque o Supabase Storage cobra uma ida e volta de rede por arquivo e
 * por pasta: um zip de 267 arquivos .md somando 561 kB levava mais de um minuto
 * em série e morria no limite de tempo da função — o custo era latência, não
 * bytes. Em lotes de STORAGE_CONCURRENCY o mesmo trabalho cai para segundos.
 *
 * (Há cópias equivalentes em openai-usage/scan.ts e reports/runner.ts; esta
 * atende a camada de storage, que é onde o problema aparece com mais força.)
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Teto de chamadas simultâneas ao Storage. 12 é confortável para a função
 * serverless e mantém a fila curta; subir muito além disso passa a esbarrar em
 * rate limit do Storage sem ganho real de tempo.
 */
export const STORAGE_CONCURRENCY = 12
