const cards = [
  { label: 'Revenue', value: 'NPR 0' },
  { label: 'Profit', value: 'NPR 0' },
  { label: 'Utilization', value: '0%' },
  { label: 'Active Rentals', value: '0' },
  { label: 'Overdue Payments', value: '0' }
];

export function KPIGrid() {
  return <div className="grid grid-cols-1 md:grid-cols-5 gap-4">{cards.map((c) => <article key={c.label} className="rounded-xl p-4 bg-[#141417]"><p className="text-xs text-zinc-400">{c.label}</p><p className="text-2xl font-semibold">{c.value}</p></article>)}</div>;
}
