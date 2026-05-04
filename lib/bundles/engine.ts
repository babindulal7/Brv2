export function detectBundles(rows: Array<{ items: string[] }>) {
  const counter = new Map<string, number>();
  for (const r of rows) {
    const sorted = [...r.items].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const k = `${sorted[i]}|${sorted[j]}`;
        counter.set(k, (counter.get(k) ?? 0) + 1);
      }
    }
  }
  return [...counter.entries()].filter(([, c]) => c >= 3).map(([k, count]) => ({ pair: k.split('|'), count }));
}
