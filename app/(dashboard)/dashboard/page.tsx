import { KpiCard } from "@/components/dashboard/kpi-card";

export default function DashboardPage() {
  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-semibold">Command Center</h2>
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Revenue" value="NPR 63,500" sub="Monthly" />
        <KpiCard label="Profit" value="NPR 27,100" sub="After expense/depreciation" />
        <KpiCard label="Utilization" value="22%" sub="2 of 9 active" />
        <KpiCard label="Overdue Payments" value="NPR 25,850" sub="2 clients" />
      </div>
      <div className="card">
        <h3 className="mb-2 text-xl">AI Panel</h3>
        <ul className="list-disc space-y-1 pl-5 text-zinc-300">
          <li>Idle Alert: 7 items have zero rental days in last 30 days.</li>
          <li>Demand Spike: Sony FX3A bookings +42% week-over-week.</li>
          <li>Pricing Action: Increase NiSi Athena bundle by 6% (elasticity-safe).</li>
        </ul>
      </div>
    </section>
  );
}
