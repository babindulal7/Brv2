import { rupees } from '../lib/money'
import type { Paisa } from '../lib/money'
import type { Role } from '../lib/auth'

export const STAFF_METRICS = {
  revenueHandled: rupees(4500000),
  collectionRate: 94.2, // percentage
  tasksCompleted: 412,
  averageResponseTime: '18m',
}

export type StaffMember = {
  id: string
  name: string
  role: Role
  revenueHandled: Paisa
  collections: Paisa
  tasksCompleted: number
  performanceScore: number // out of 100
  averageResponseTime?: string
}

export const STAFF_LIST: StaffMember[] = [
  {
    id: 'STF-001',
    name: 'Bishal Thapa',
    role: 'Manager',
    revenueHandled: rupees(1250000),
    collections: rupees(1150000),
    tasksCompleted: 145,
    averageResponseTime: '12m',
    performanceScore: 94
  },
  {
    id: 'STF-002',
    name: 'Riya Maharjan',
    role: 'Coordinator',
    revenueHandled: rupees(850000),
    collections: rupees(820000),
    tasksCompleted: 112,
    averageResponseTime: '15m',
    performanceScore: 88
  },
  {
    id: 'STF-003',
    name: 'Sushant Shrestha',
    role: 'Technician',
    revenueHandled: rupees(450000),
    collections: rupees(445000),
    tasksCompleted: 155,
    averageResponseTime: '22m',
    performanceScore: 91
  },
]
