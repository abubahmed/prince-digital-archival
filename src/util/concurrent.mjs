/**
 * Process items in chunks of `size` concurrently.
 * `fn` receives each item and returns a result.
 * Returns results in the original item order.
 */
export async function mapConcurrent(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}
