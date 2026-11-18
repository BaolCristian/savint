/** Unbiased Fisher-Yates shuffle. Returns a new array.
 *  (`sort(() => Math.random() - 0.5)` is biased and with few items
 *  often leaves them in, or close to, their original order.) */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffle that never returns the original order (when the items are not
 *  all equal): for ORDERING and MATCHING the original order IS the answer. */
export function shuffleAwayFromOriginal<T>(items: readonly T[]): T[] {
  const same = (a: readonly T[]) => a.every((x, i) => x === items[i]);
  if (items.length < 2 || items.every((x) => x === items[0])) return [...items];
  let out = shuffle(items);
  while (same(out)) out = shuffle(items);
  return out;
}
