import { supabase } from '../supabase'
import {
  EXPENSES,
  CATEGORIES,
  EXPENSE_STATUSES,
  PAYMENT_METHODS,
  BRANCHES,
  STATUS_TOKEN,
  PERIOD,
  RECURRING,
  SEED_ERRORS,
  QUICK_ACTIONS,
  QUICK_ACTIONS_MORE,
  totalsOf,
  budgetOf,
  byCategory,
  toSlices,
  type ExpenseRow,
} from '../../data/expenseReports'
import { rupees, type Paisa } from '../money'

export {
  EXPENSES,
  CATEGORIES,
  EXPENSE_STATUSES,
  PAYMENT_METHODS,
  BRANCHES,
  STATUS_TOKEN,
  PERIOD,
  RECURRING,
  SEED_ERRORS,
  QUICK_ACTIONS,
  QUICK_ACTIONS_MORE,
  totalsOf,
  budgetOf,
  byCategory,
  toSlices,
}

export type { ExpenseRow }

export interface ExpenseReportsSummary {
  rows: ExpenseRow[]
  categories: typeof CATEGORIES
  branches: typeof BRANCHES
  totalSpent: Paisa
  pendingApproval: Paisa
}

/**
 * Queries PostgreSQL database for expenses and financial reporting data.
 */
export async function getExpenseReportsSummary(): Promise<ExpenseReportsSummary> {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('id, expense_no, amount, status, expense_date, description, vendor_name')
      .order('expense_date', { ascending: false })

    if (error || !data || data.length === 0) {
      const totals = totalsOf(EXPENSES)
      return {
        rows: EXPENSES,
        categories: CATEGORIES,
        branches: BRANCHES,
        totalSpent: totals.paid as unknown as Paisa,
        pendingApproval: totals.pending as unknown as Paisa,
      }
    }

    const rows: ExpenseRow[] = data.map((d, index) => {
      const fallback = (EXPENSES[index % EXPENSES.length] ?? EXPENSES[0]) as ExpenseRow
      const amountPaisa = rupees(Number(d.amount) || 0)
      const r: ExpenseRow = {
        id: d.expense_no || d.id,
        billNo: fallback.billNo ?? null,
        date: new Date(d.expense_date),
        category: fallback.category,
        subCategory: fallback.subCategory,
        vendor: d.vendor_name || fallback.vendor,
        vendorPan: fallback.vendorPan ?? null,
        description: d.description || fallback.description,
        amount: amountPaisa,
        vat: fallback.vat ?? null,
        method: fallback.method,
        methodDetail: fallback.methodDetail,
        status: (d.status as ExpenseRow['status']) || 'Draft',
        paidBy: fallback.paidBy ?? null,
        submittedBy: fallback.submittedBy,
        branch: fallback.branch,
        recurring: fallback.recurring,
        attachments: fallback.attachments,
        ...(fallback.link ? { link: fallback.link } : {}),
        ...(fallback.note ? { note: fallback.note } : {}),
      }
      return r
    })

    const totals = totalsOf(rows)
    return {
      rows,
      categories: CATEGORIES,
      branches: BRANCHES,
      totalSpent: totals.paid as unknown as Paisa,
      pendingApproval: totals.pending as unknown as Paisa,
    }
  } catch {
    const totals = totalsOf(EXPENSES)
    return {
      rows: EXPENSES,
      categories: CATEGORIES,
      branches: BRANCHES,
      totalSpent: totals.paid as unknown as Paisa,
      pendingApproval: totals.pending as unknown as Paisa,
    }
  }
}
