import { KpiCard } from "@/components/dashboard/kpi-card";
import { supabase } from "@/lib/db/supabase";
import { format, startOfMonth } from "date-fns";

function formatNPR(amount: number) {
  return `NPR ${amount.toLocaleString("en-IN")}`;
}

export default async function DashboardPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  let revenue = 0, expenses = 0, overdueAmount = 0;
  let activeUnits = 0, totalUnits = 0;

  try {
    const [paymentsRes, expensesRes, overdueRes, activeRentalsRes, unitCountRes] = await Promise.all([
      supabase.from("payments").select("amount").eq("status", "paid").gte("paid_at", monthStart),
      supabase.from("expenses").select("amount").gte("expense_date", monthStart),
      supabase
        .from("invoices")
        .select("total_amount,paid_amount")
        .lt("due_date", today)
        .neq("payment_status", "paid")
        .neq("payment_status", "refunded"),
      supabase
        .from("rentals")
        .select("rental_items(equipment_unit_id)")
        .in("status", ["active", "booked"]),
      supabase.from("equipment_units").select("*", { count: "exact", head: true }),
    ]);

    revenue = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
    expenses = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
    overdueAmount = (overdueRes.data ?? []).reduce(
      (s, inv) => s + Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount)),
      0
    );

    type RentalWithItems = { rental_items: { equipment_unit_id: string }[] };
    activeUnits = new Set(
      ((activeRentalsRes.data ?? []) as RentalWithItems[]).flatMap((r) =>
        r.rental_items.map((i) => i.equipment_unit_id)
      )
    ).size;
    totalUnits = unitCountRes.count ?? 0;
  } catch {
    // Supabase unavailable — render zeros until env vars are configured
  }

  const profit = revenue - expenses;
  const utilization = totalUnits > 0 ? Math.round((activeUnits / totalUnits) * 100) : 0;

  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-semibold">Command Center</h2>
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Revenue" value={formatNPR(revenue)} sub="Month to date" />
        <KpiCard label="Profit" value={formatNPR(profit)} sub="After expenses" />
        <KpiCard label="Utilization" value={`${utilization}%`} sub={`${activeUnits} of ${totalUnits} active`} />
        <KpiCard label="Overdue Payments" value={formatNPR(overdueAmount)} sub="Past due invoices" />
      </div>
      <div className="card">
        <h3 className="mb-2 text-xl">AI Panel</h3>
        <p className="text-sm text-zinc-500">Connect the analytics API to populate AI-driven insights.</p>
      </div>
    </section>
  );
}
