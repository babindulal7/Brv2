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

    if (error) {
      return {
        rows: [],
        categories: CATEGORIES,
        branches: BRANCHES,
        totalSpent: 0 as Paisa,
        pendingApproval: 0 as Paisa,
      }
    }

    const rows: ExpenseRow[] = (data ?? []).map((d) => {
      const amountPaisa = rupees(Number(d.amount) || 0)
      const r: ExpenseRow = {
        id: d.expense_no || d.id,
        // Fields not yet in the DB query — stubs, not seed values.
        // Extend the select() above when the DB columns are ready.
        billNo: null,
        date: new Date(d.expense_date),
        category: 'Miscellaneous',
        subCategory: 'Other',
        vendor: d.vendor_name || '-',
        vendorPan: null,
        description: d.description || '-',
        amount: amountPaisa,
        vat: null,
        method: 'Cash',
        methodDetail: '',
        status: (d.status as ExpenseRow['status']) || 'Draft',
        paidBy: null,
        submittedBy: '-',
        branch: 'Boudha (Head Office)',
        recurring: false,
        attachments: 0,
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
    return {
      rows: [],
      categories: CATEGORIES,
      branches: BRANCHES,
      totalSpent: 0 as Paisa,
      pendingApproval: 0 as Paisa,
    }
  }
}
