import { useState, useEffect, useCallback } from 'react'
import { apiClient, ApiFinancedExpense, ApiFinancedExpensePayment } from '../utils/api'
import { FinancedExpense, FinancedExpensePayment, Person } from '../types'

// Type mapping utilities - Convert between frontend and API types

function financedExpenseToApiFinancedExpense(expense: FinancedExpense): any {
  return {
    title: expense.title,
    description: expense.description,
    totalAmountCents: Math.round(expense.totalAmount * 100),
    // monthlyPaymentCents is calculated by the server, not sent from frontend
    interestRatePercent: expense.interestRatePercent,
    financingTermMonths: expense.financingTermMonths,
    purchaseDate: expense.purchaseDate,
    firstPaymentDate: expense.firstPaymentDate,
    isActive: expense.isActive,
    splitMode: expense.splitMode,
    splits: expense.splits.map(split => ({
      memberId: split.personId,
      value: split.value
    }))
  }
}

function apiFinancedExpenseToFinancedExpense(apiExpense: ApiFinancedExpense): FinancedExpense {
  return {
    id: apiExpense.id,
    title: apiExpense.title,
    description: apiExpense.description,
    totalAmount: apiExpense.totalAmountCents / 100,
    monthlyPayment: apiExpense.monthlyPaymentCents / 100,
    interestRatePercent: apiExpense.interestRatePercent,
    financingTermMonths: apiExpense.financingTermMonths,
    purchaseDate: apiExpense.purchaseDate,
    firstPaymentDate: apiExpense.firstPaymentDate,
    isActive: apiExpense.isActive,
    amount: apiExpense.monthlyPaymentCents / 100, // For Splittable interface
    splitMode: apiExpense.splitMode as any,
    splits: apiExpense.splits.map(split => ({
      personId: split.memberId,
      value: split.value
    }))
  }
}

function apiFinancedExpensePaymentToFinancedExpensePayment(apiPayment: ApiFinancedExpensePayment): FinancedExpensePayment {
  return {
    id: apiPayment.id,
    financedExpenseId: apiPayment.financedExpenseId,
    paymentNumber: apiPayment.paymentNumber,
    dueDate: apiPayment.dueDate,
    amount: apiPayment.amountCents / 100,
    principal: apiPayment.principalCents / 100,
    interest: apiPayment.interestCents / 100,
    isPaid: apiPayment.isPaid,
    paidDate: apiPayment.paidDate,
    billId: apiPayment.billId
  }
}

// Generic hook type for financed expenses
type FinancedExpenseHookResult<T> = [T[], (data: T[]) => void, boolean, string | null]

// Financed Expenses hook with fault tolerance
export function useFinancedExpenses(): FinancedExpenseHookResult<FinancedExpense> {
  const [data, setData] = useState<FinancedExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const apiExpenses = await apiClient.getFinancedExpenses()
      setData(apiExpenses.map(apiFinancedExpenseToFinancedExpense))
      setWarning(null)
    } catch (err) {
      setWarning('Unable to load financed expenses from server. You can still add new ones.')
      console.warn('Financed expenses fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: FinancedExpense[]) => {
    setData(newData)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Individual financed expense hook
export function useFinancedExpense(id: string): [FinancedExpense | null, boolean, string | null] {
  const [data, setData] = useState<FinancedExpense | null>(null)
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    const fetchExpense = async () => {
      try {
        setLoading(true)
        const apiExpense = await apiClient.getFinancedExpense(id)
        setData(apiFinancedExpenseToFinancedExpense(apiExpense))
        setWarning(null)
      } catch (err) {
        setWarning('Unable to load financed expense details.')
        console.warn('Individual financed expense fetch failed:', err)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchExpense()
    }
  }, [id])

  return [data, loading, warning]
}

// Financed expense payments hook
export function useFinancedExpensePayments(expenseId: string): [FinancedExpensePayment[], boolean, string | null] {
  const [data, setData] = useState<FinancedExpensePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        setLoading(true)
        const apiPayments = await apiClient.getFinancedExpensePayments(expenseId)
        setData(apiPayments.map(apiFinancedExpensePaymentToFinancedExpensePayment))
        setWarning(null)
      } catch (err) {
        setWarning('Unable to load payment schedule.')
        console.warn('Financed expense payments fetch failed:', err)
      } finally {
        setLoading(false)
      }
    }

    if (expenseId) {
      fetchPayments()
    }
  }, [expenseId])

  return [data, loading, warning]
}

// API operations for financed expenses
export const financedExpenseOperations = {
  async createFinancedExpense(expense: FinancedExpense): Promise<FinancedExpense> {
    const apiExpense = await apiClient.createFinancedExpense(financedExpenseToApiFinancedExpense(expense))
    return apiFinancedExpenseToFinancedExpense(apiExpense)
  },

  async updateFinancedExpense(expense: FinancedExpense): Promise<FinancedExpense> {
    const apiExpense = await apiClient.updateFinancedExpense(expense.id, financedExpenseToApiFinancedExpense(expense))
    return apiFinancedExpenseToFinancedExpense(apiExpense)
  },

  async deleteFinancedExpense(id: string): Promise<void> {
    await apiClient.deleteFinancedExpense(id)
  },

  async markPaymentPaid(expenseId: string, paymentId: string, paidDate: string): Promise<FinancedExpensePayment> {
    const apiPayment = await apiClient.markFinancedExpensePaymentPaid(expenseId, paymentId, { paidDate })
    return apiFinancedExpensePaymentToFinancedExpensePayment(apiPayment)
  },

  async unmarkPaymentPaid(expenseId: string, paymentId: string): Promise<FinancedExpensePayment> {
    const apiPayment = await apiClient.unmarkFinancedExpensePaymentPaid(expenseId, paymentId)
    return apiFinancedExpensePaymentToFinancedExpensePayment(apiPayment)
  }
}