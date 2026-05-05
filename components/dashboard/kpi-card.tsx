export function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="card">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <h3 className="mt-2 text-4xl font-bold">{value}</h3>
      {sub ? <p className="mt-1 text-zinc-400">{sub}</p> : null}
    </article>
  );
}
