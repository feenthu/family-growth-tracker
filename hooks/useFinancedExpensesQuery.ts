import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiFinancedExpense, ApiFinancedExpenseComplete, ApiFinancedExpensePayment } from '../utils/api'
import { FinancedExpense, FinancedExpensePayment } from '../types'

// Type mapping utilities - Convert between frontend and API types
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

function financedExpenseToApiFinancedExpense(expense: FinancedExpense): any {
  return {
    title: expense.title,
    description: expense.description,
    totalAmountCents: Math.round(expense.totalAmount * 100),
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

// Complete response type combining expense and payments
export interface FinancedExpenseComplete {
  expense: FinancedExpense
  payments: FinancedExpensePayment[]
}

// Query Keys for React Query
export const financedExpenseKeys = {
  all: ['financed-expenses'] as const,
  lists: () => [...financedExpenseKeys.all, 'list'] as const,
  list: (filters: Record<string, any> = {}) => [...financedExpenseKeys.lists(), filters] as const,
  details: () => [...financedExpenseKeys.all, 'detail'] as const,
  detail: (id: string) => [...financedExpenseKeys.details(), id] as const,
  complete: (id: string) => [...financedExpenseKeys.detail(id), 'complete'] as const,
}

// Error handling utilities
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('fetch') ||
           error.message.includes('network') ||
           error.message.includes('ECONNREFUSED') ||
           error.message.includes('ENOTFOUND')
  }
  return false
}

function isServerError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('HTTP 5') ||
           error.message.includes('Internal Server Error')
  }
  return false
}

function shouldRetryError(error: unknown): boolean {
  return isNetworkError(error) || isServerError(error)
}

// React Query Hooks

/**
 * Get all financed expenses
 */
export function useFinancedExpensesQuery() {
  return useQuery({
    queryKey: financedExpenseKeys.list(),
    queryFn: async (): Promise<FinancedExpense[]> => {
      try {
        const apiExpenses = await apiClient.getFinancedExpenses()
        return apiExpenses.map(apiFinancedExpenseToFinancedExpense)
      } catch (error) {
        console.error('Failed to fetch financed expenses:', error)
        throw error
      }
    },
    retry: (failureCount, error) => {
      // Don't retry on client errors (4xx), but retry on network/server errors
      if (failureCount >= 3) return false
      return shouldRetryError(error)
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  })
}

/**
 * Get complete expense with payments data for a specific expense
 */
export function useFinancedExpenseCompleteQuery(id: string) {
  return useQuery({
    queryKey: financedExpenseKeys.complete(id),
    queryFn: async (): Promise<FinancedExpenseComplete> => {
      try {
        const apiData = await apiClient.getFinancedExpenseComplete(id)
        return {
          expense: apiFinancedExpenseToFinancedExpense(apiData.expense),
          payments: apiData.payments.map(apiFinancedExpensePaymentToFinancedExpensePayment)
        }
      } catch (error) {
        console.error(`Failed to fetch financed expense ${id}:`, error)
        throw error
      }
    },
    enabled: !!id,
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false
      return shouldRetryError(error)
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 2 * 60 * 1000, // 2 minutes (payments change more frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get a single financed expense (without payments)
 */
export function useFinancedExpenseQuery(id: string) {
  return useQuery({
    queryKey: financedExpenseKeys.detail(id),
    queryFn: async (): Promise<FinancedExpense> => {
      const apiExpense = await apiClient.getFinancedExpense(id)
      return apiFinancedExpenseToFinancedExpense(apiExpense)
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Mutation parameter types
interface MarkPaymentParams {
  expenseId: string
  paymentId: string
  paidDate: string
}

interface UnmarkPaymentParams {
  expenseId: string
  paymentId: string
}

interface CreateExpenseParams {
  expense: FinancedExpense
}

interface UpdateExpenseParams {
  id: string
  expense: FinancedExpense
}

interface DeleteExpenseParams {
  id: string
}

/**
 * Mutations for financed expenses with optimistic updates and cache invalidation
 */
export function useFinancedExpenseMutations() {
  const queryClient = useQueryClient()

  const createFinancedExpense = useMutation({
    mutationFn: async ({ expense }: CreateExpenseParams): Promise<FinancedExpense> => {
      const apiExpense = await apiClient.createFinancedExpense(financedExpenseToApiFinancedExpense(expense))
      return apiFinancedExpenseToFinancedExpense(apiExpense)
    },
    onSuccess: () => {
      // Invalidate the expenses list to trigger refetch
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.lists() })
    },
    onError: (error) => {
      console.error('Failed to create financed expense:', error)
      // TODO: Show toast notification to user
      if (error instanceof Error) {
        if (error.message.includes('HTTP 4')) {
          console.error('Client error: Check input validation')
        } else if (isNetworkError(error)) {
          console.error('Network error: Check internet connection')
        } else if (isServerError(error)) {
          console.error('Server error: Please try again later')
        }
      }
    }
  })

  const updateFinancedExpense = useMutation({
    mutationFn: async ({ id, expense }: UpdateExpenseParams): Promise<FinancedExpense> => {
      const apiExpense = await apiClient.updateFinancedExpense(id, financedExpenseToApiFinancedExpense(expense))
      return apiFinancedExpenseToFinancedExpense(apiExpense)
    },
    onSuccess: (data, { id }) => {
      // Update the specific expense in cache
      queryClient.setQueryData(financedExpenseKeys.detail(id), data)
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.complete(id) })
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.lists() })
    },
    onError: (error) => {
      console.error('Failed to update financed expense:', error)
    }
  })

  const deleteFinancedExpense = useMutation({
    mutationFn: async ({ id }: DeleteExpenseParams): Promise<void> => {
      await apiClient.deleteFinancedExpense(id)
    },
    onSuccess: (_, { id }) => {
      // Remove the expense from cache
      queryClient.removeQueries({ queryKey: financedExpenseKeys.detail(id) })
      queryClient.removeQueries({ queryKey: financedExpenseKeys.complete(id) })
      // Invalidate the list query
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.lists() })
    },
    onError: (error) => {
      console.error('Failed to delete financed expense:', error)
    }
  })

  const markPaymentPaid = useMutation({
    mutationFn: async ({ expenseId, paymentId, paidDate }: MarkPaymentParams): Promise<FinancedExpensePayment> => {
      const apiPayment = await apiClient.markFinancedExpensePaymentPaid(expenseId, paymentId, { paidDate })
      return apiFinancedExpensePaymentToFinancedExpensePayment(apiPayment)
    },
    onMutate: async ({ expenseId, paymentId, paidDate }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: financedExpenseKeys.complete(expenseId) })

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<FinancedExpenseComplete>(financedExpenseKeys.complete(expenseId))

      // Optimistically update the payment
      if (previousData) {
        const updatedData = {
          ...previousData,
          payments: previousData.payments.map(payment =>
            payment.id === paymentId
              ? { ...payment, isPaid: true, paidDate }
              : payment
          )
        }
        queryClient.setQueryData(financedExpenseKeys.complete(expenseId), updatedData)
      }

      // Return a context object with the snapshotted value
      return { previousData }
    },
    onError: (err, { expenseId }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(financedExpenseKeys.complete(expenseId), context.previousData)
      }

      console.error('Failed to mark payment as paid:', err)
      // TODO: Show toast notification to user
      if (err instanceof Error) {
        if (isNetworkError(err)) {
          console.error('Network error: Check internet connection and try again')
        } else if (isServerError(err)) {
          console.error('Server error: Payment status may be out of sync, refreshing...')
        } else {
          console.error('Payment update failed: Please refresh and try again')
        }
      }
    },
    onSettled: (_, __, { expenseId }) => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.complete(expenseId) })
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.lists() })
    }
  })

  const unmarkPaymentPaid = useMutation({
    mutationFn: async ({ expenseId, paymentId }: UnmarkPaymentParams): Promise<FinancedExpensePayment> => {
      const apiPayment = await apiClient.unmarkFinancedExpensePaymentPaid(expenseId, paymentId)
      return apiFinancedExpensePaymentToFinancedExpensePayment(apiPayment)
    },
    onMutate: async ({ expenseId, paymentId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: financedExpenseKeys.complete(expenseId) })

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<FinancedExpenseComplete>(financedExpenseKeys.complete(expenseId))

      // Optimistically update the payment
      if (previousData) {
        const updatedData = {
          ...previousData,
          payments: previousData.payments.map(payment =>
            payment.id === paymentId
              ? { ...payment, isPaid: false, paidDate: undefined }
              : payment
          )
        }
        queryClient.setQueryData(financedExpenseKeys.complete(expenseId), updatedData)
      }

      return { previousData }
    },
    onError: (err, { expenseId }, context) => {
      // Roll back on error
      if (context?.previousData) {
        queryClient.setQueryData(financedExpenseKeys.complete(expenseId), context.previousData)
      }
    },
    onSettled: (_, __, { expenseId }) => {
      // Always refetch to ensure latest data
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.complete(expenseId) })
      queryClient.invalidateQueries({ queryKey: financedExpenseKeys.lists() })
    }
  })

  return {
    createFinancedExpense,
    updateFinancedExpense,
    deleteFinancedExpense,
    markPaymentPaid,
    unmarkPaymentPaid
  }
}

// Helper hooks for common operations
export function useMarkPaymentPaid() {
  const { markPaymentPaid } = useFinancedExpenseMutations()
  return markPaymentPaid
}

export function useUnmarkPaymentPaid() {
  const { unmarkPaymentPaid } = useFinancedExpenseMutations()
  return unmarkPaymentPaid
}