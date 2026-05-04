'use client';

import { KPIGrid } from './kpi-grid';
import { RevenueChart } from './revenue-chart';

export function DashboardPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Babin Rentals v2 Command Center</h1>
      <KPIGrid />
      <RevenueChart />
    </main>
  );
}
