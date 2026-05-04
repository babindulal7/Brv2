'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const data = [{ name: 'W1', income: 0, expense: 0 }];

export function RevenueChart() {
  return <section className="rounded-xl p-4 bg-[#141417] h-80"><h2 className="font-semibold mb-3">Income vs Expense</h2><ResponsiveContainer><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><Tooltip /><Area type="monotone" dataKey="income" stroke="#00D1FF" fill="#00D1FF22" /><Area type="monotone" dataKey="expense" stroke="#E50914" fill="#E5091422" /></AreaChart></ResponsiveContainer></section>;
}
