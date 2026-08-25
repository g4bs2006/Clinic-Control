// Pool de concorrência — módulo puro (sem React, sem I/O), testável.

/**
 * Roda `fn` sobre `items` com no máximo `limit` promessas em voo, preservando
 * a ordem do array de entrada (o índice i recebe o resultado de items[i]).
 * Usado para as rajadas de chamadas à Helena (home, comparativo e crons): sem
 * isso, uma conta travada ou o rate limit do parceiro atrasava a página
 * inteira.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
