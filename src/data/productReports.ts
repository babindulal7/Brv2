import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'

/** Product Reports seed data — transcribed from render `34BC280B`. */

export const KPIS: Kpi[] = [
  { label: 'Total Product Revenue', value: 'Rs 8,46,500', icon: 'dollar', accent: 'primary', delta: { direction: 'up', text: '18.4% vs last month' }, spark: [40, 48, 44, 56, 52, 64, 60, 70, 66, 76, 72, 82] },
  { label: 'Products Sold', value: '1,264', icon: 'box', accent: 'primary', delta: { direction: 'up', text: '15.7% vs last month' }, spark: [32, 40, 36, 48, 44, 55, 51, 62, 58, 68, 64, 74] },
  { label: 'Gross Profit', value: 'Rs 3,12,800', icon: 'chart', accent: 'success', delta: { direction: 'up', text: '16.2% vs last month' }, spark: [30, 38, 34, 46, 42, 54, 50, 60, 56, 66, 62, 72] },
  { label: 'Low Stock Products', value: '22', icon: 'alert_triangle', accent: 'danger', delta: { direction: 'up', text: '4 vs last month', good: false }, spark: [20, 24, 22, 28, 26, 32, 30, 36, 34, 40, 38, 44] },
]

export const FILTERS = ['All Categories', 'All Brands', 'All Suppliers', 'All Products', 'All Branches', 'All Staff', 'All Payment Methods', 'Stock Status (All)']

export const SALES_TREND = {
  yTicks: ['1M', '800K', '600K', '400K', '200K', '0'],
  labels: ['1 May', '6 May', '11 May', '16 May', '21 May', '26 May', '31 May'],
  series: [
    { name: 'Revenue', points: [42, 50, 46, 58, 54, 66, 62, 74, 70, 80, 76, 88, 84, 92, 96] },
    { name: 'Profit', points: [18, 22, 20, 26, 24, 30, 28, 34, 32, 38, 36, 42, 40, 45, 48] },
  ],
}

export const BY_CATEGORY: Slice[] = [
  { label: 'Batteries', value: 404, display: '32%', percent: '(404)' },
  { label: 'Storage', value: 303, display: '24%', percent: '(303)' },
  { label: 'Accessories', value: 227, display: '18%', percent: '(227)' },
  { label: 'Filters', value: 139, display: '11%', percent: '(139)' },
  { label: 'Cleaning', value: 101, display: '8%', percent: '(101)' },
  { label: 'Merchandise', value: 90, display: '7%', percent: '(90)' },
]
export const CATEGORY_TOTAL = '1,264'

export const TOP_REVENUE = {
  axisTicks: ['0', '50K', '100K', '150K'],
  rows: [
    { label: 'FXLion Nano Two V-Mount', value: 128000, display: 'Rs 1,28,000' },
    { label: 'SanDisk 128GB SD Card', value: 96500, display: 'Rs 96,500' },
    { label: 'Nitecore Charger U4', value: 72300, display: 'Rs 72,300' },
    { label: 'SmallRig Cage Kit', value: 58800, display: 'Rs 58,800' },
    { label: 'NiSi ND Filter 77mm', value: 48600, display: 'Rs 48,600' },
  ],
}

export const PROFIT_TREND = {
  yTicks: ['1M', '800K', '600K', '400K', '200K', '0'],
  groups: [
    { label: 'Week 1', values: [58, 40, 18] },
    { label: 'Week 2', values: [66, 46, 20] },
    { label: 'Week 3', values: [72, 50, 22] },
    { label: 'Week 4', values: [84, 58, 26] },
    { label: 'Week 5', values: [92, 62, 30] },
  ],
  series: ['Revenue', 'Cost', 'Profit'],
}

export const TURNOVER = {
  axisTicks: ['0', '3x', '6x', '9x', '12x'],
  rows: [
    { label: 'Accessories', value: 11.2, display: '11.2x' },
    { label: 'Storage', value: 9.6, display: '9.6x' },
    { label: 'Batteries', value: 8.8, display: '8.8x' },
    { label: 'Filters', value: 6.7, display: '6.7x' },
    { label: 'Cleaning', value: 5.2, display: '5.2x' },
    { label: 'Merchandise', value: 3.1, display: '3.1x' },
  ],
}

export const FAST_MOVING = [
  { name: 'FXLion Nano Two V-Mount', value: '128', pct: 100 },
  { name: 'SanDisk 128GB SD Card', value: '116', pct: 91 },
  { name: 'Nitecore Charger U4', value: '98', pct: 77 },
  { name: 'SmallRig Cage Kit', value: '86', pct: 67 },
  { name: 'NiSi ND Filter 77mm', value: '74', pct: 58 },
]

export const SLOW_MOVING = [
  { name: 'Tilta Follow Focus Nucleus', value: '2', pct: 40 },
  { name: 'Atomos Ninja V Monitor', value: '3', pct: 60 },
  { name: 'Blackmagic Pocket 4K Cage', value: '4', pct: 80 },
  { name: 'Hollyland Mars 400S Pro', value: '4', pct: 80 },
  { name: 'DJI Wireless Transmitter', value: '5', pct: 100 },
]

export const DEAD_STOCK = [
  { name: 'Sony XQD 64GB Card', value: '210', pct: 100 },
  { name: 'Teradek Bolt 500 RX', value: '198', pct: 94 },
  { name: 'Aputure Light Dome II', value: '176', pct: 84 },
  { name: 'Ronin 2 Grip', value: '154', pct: 73 },
  { name: 'Wooden Camera Handle', value: '143', pct: 68 },
]

export const RETURNS: Slice[] = [
  { label: 'Defective', value: 38, display: '38', percent: '(39.6%)' },
  { label: 'Wrong Item', value: 24, display: '24', percent: '(25.0%)' },
  { label: 'Change of Mind', value: 18, display: '18', percent: '(18.8%)' },
  { label: 'Damaged', value: 10, display: '10', percent: '(10.4%)' },
  { label: 'Other', value: 6, display: '6', percent: '(6.3%)' },
]
export const RETURNS_TOTAL = '96'

export interface ProductRow {
  name: string
  sku: string
  category: string
  brand: string
  sold: string
  revenue: string
  cost: string
  profit: string
  margin: string
  stock: string
  stockTone: 'danger' | 'progress'
  supplier: string
  returnRate: string
}

export const PRODUCTS: ProductRow[] = [
  { name: 'FXLion Nano Two V-Mount', sku: 'FXL-N2', category: 'Batteries', brand: 'FXLion', sold: '128', revenue: '1,28,000', cost: '83,000', profit: '45,000', margin: '35.2%', stock: '4', stockTone: 'danger', supplier: 'FXLion Official', returnRate: '0.8%' },
  { name: 'SanDisk 128GB SD Card', sku: 'SD-128G', category: 'Storage', brand: 'SanDisk', sold: '116', revenue: '96,500', cost: '63,300', profit: '33,200', margin: '34.4%', stock: '6', stockTone: 'progress', supplier: 'SanDisk Nepal', returnRate: '1.7%' },
  { name: 'Nitecore Charger U4', sku: 'NC-U4', category: 'Accessories', brand: 'Nitecore', sold: '98', revenue: '72,300', cost: '46,900', profit: '25,400', margin: '35.1%', stock: '3', stockTone: 'danger', supplier: 'Nitecore Nepal', returnRate: '1.0%' },
  { name: 'SmallRig Cage Kit', sku: 'SR-CK01', category: 'Accessories', brand: 'SmallRig', sold: '86', revenue: '58,800', cost: '38,700', profit: '20,100', margin: '34.2%', stock: '2', stockTone: 'danger', supplier: 'Camera Accessories Nepal', returnRate: '1.3%' },
  { name: 'NiSi ND Filter 77mm', sku: 'NS-ND77', category: 'Filters', brand: 'NiSi', sold: '74', revenue: '48,600', cost: '32,000', profit: '16,600', margin: '34.2%', stock: '1', stockTone: 'danger', supplier: 'ProMaster Distributors', returnRate: '2.1%' },
]

export const SUMMARY = [
  { label: 'Product Revenue', value: 'Rs 8,46,500' },
  { label: 'Gross Profit', value: 'Rs 3,12,800' },
  { label: 'Units Sold', value: '1,264' },
  { label: 'Average Margin', value: '36%' },
  { label: 'Inventory Turnover', value: '8.4x' },
  { label: 'Low Stock Products', value: '22', tone: 'danger' as const },
]

export const TOP_SELLING = [
  { rank: 1, name: 'FXLion Nano Two V-Mount', sold: '128', revenue: '1,28,000', profit: '45,000' },
  { rank: 2, name: 'SanDisk 128GB SD Card', sold: '116', revenue: '96,500', profit: '33,200' },
  { rank: 3, name: 'Nitecore Charger U4', sold: '98', revenue: '72,300', profit: '25,400' },
  { rank: 4, name: 'SmallRig Cage Kit', sold: '86', revenue: '58,800', profit: '20,100' },
  { rank: 5, name: 'NiSi ND Filter 77mm', sold: '74', revenue: '48,600', profit: '16,600' },
]

export const LOW_STOCK = [
  { name: 'NiSi ND Filter 77mm', stock: '1', min: '5', reorder: '10' },
  { name: 'SmallRig Cage Kit', stock: '2', min: '5', reorder: '10' },
  { name: 'Hollyland Mars 400S Pro', stock: '2', min: '5', reorder: '10' },
  { name: 'DJI Wireless Transmitter', stock: '1', min: '3', reorder: '6' },
  { name: 'Teradek Bolt 500 RX', stock: '2', min: '5', reorder: '10' },
]

export const SUPPLIERS = [
  { rank: 1, name: 'Camera Accessories Nepal', revenue: '2,45,000', margin: '33.9%', lead: '3.2' },
  { rank: 2, name: 'ProMaster Distributors', revenue: '1,98,000', margin: '35.4%', lead: '4.6' },
  { rank: 3, name: 'FXLion Official', revenue: '1,42,000', margin: '35.2%', lead: '2.1' },
  { rank: 4, name: 'Nitecore Nepal', revenue: '98,000', margin: '36.7%', lead: '3.0' },
  { rank: 5, name: 'SanDisk Nepal', revenue: '76,000', margin: '33.8%', lead: '2.4' },
]
