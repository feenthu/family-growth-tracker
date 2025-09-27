// In browser context, we need to detect environment differently
const API_BASE = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? 'https://family-growth-tracker-production.up.railway.app'
  : 'http://localhost:8080'

export interface ApiMember {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface ApiBill {
  id: string
  name: string
  amountCents: number
  dueDate: string
  recurringBillId?: string
  period?: string
  splitMode: string
  createdAt: string
  updatedAt: string
  splits: ApiBillSplit[]
  payments?: ApiPayment[]
}

export interface ApiBillSplit {
  id: string
  billId: string
  memberId: string
  value: number
  createdAt: string
}

export interface ApiPayment {
  id: string
  billId: string
  paidDate: string
  amountCents: number
  method: string
  payerMemberId?: string
  note?: string
  receiptFilename?: string
  receiptData?: string
  createdAt: string
  allocations: ApiPaymentAllocation[]
  payerMember?: ApiMember
}

export interface ApiPaymentAllocation {
  id: string
  paymentId: string
  memberId: string
  amountCents: number
  createdAt: string
}

export interface ApiRecurringBill {
  id: string
  name: string
  amountCents: number
  dayOfMonth: number
  frequency: string
  lastGeneratedPeriod: string
  splitMode: string
  createdAt: string
  updatedAt: string
  splits: ApiRecurringBillSplit[]
}

export interface ApiRecurringBillSplit {
  id: string
  recurringBillId: string
  memberId: string
  value: number
  createdAt: string
}

export interface ApiMortgage {
  id: string
  name: string
  lender?: string
  isPrimary: boolean
  originalPrincipalCents: number
  currentPrincipalCents: number
  interestRateApy: number
  termMonths: number
  startDate: string
  scheduledPaymentCents: number
  paymentDay: number
  escrowEnabled: boolean
  escrowTaxesCents?: number
  escrowInsuranceCents?: number
  escrowMipCents?: number
  escrowHoaCents?: number
  notes?: string
  active: boolean
  splitMode: string
  createdAt: string
  updatedAt: string
  splits: ApiMortgageSplit[]
  payments?: ApiMortgagePayment[]
}

export interface ApiMortgageSplit {
  id: string
  mortgageId: string
  memberId: string
  value: number
  createdAt: string
}

export interface ApiMortgagePayment {
  id: string
  mortgageId: string
  paidDate: string
  amountCents: number
  method: string
  payerMemberId?: string
  note?: string
  receiptFilename?: string
  receiptData?: string
  createdAt: string
  allocations: ApiMortgagePaymentAllocation[]
  payerMember?: ApiMember
  breakdown?: ApiMortgagePaymentBreakdown
}

export interface ApiMortgagePaymentAllocation {
  id: string
  paymentId: string
  memberId: string
  amountCents: number
  createdAt: string
}

export interface ApiMortgagePaymentBreakdown {
  id: string
  paymentId: string
  mortgageId: string
  principalCents: number
  interestCents: number
  escrowCents: number
  createdAt: string
}

// Financed Expenses API Types
export interface ApiFinancedExpense {
  id: string
  title: string
  description?: string
  totalAmountCents: number
  monthlyPaymentCents: number
  interestRatePercent: number
  financingTermMonths: number
  purchaseDate: string
  firstPaymentDate: string
  isActive: boolean
  splitMode: string
  createdAt: string
  updatedAt: string
  splits: ApiFinancedExpenseSplit[]
  payments?: ApiFinancedExpensePayment[]
}

export interface ApiFinancedExpenseSplit {
  id: string
  financedExpenseId: string
  memberId: string
  value: number
  createdAt: string
}

export interface ApiFinancedExpensePayment {
  id: string
  financedExpenseId: string
  paymentNumber: number
  dueDate: string
  amountCents: number
  principalCents: number
  interestCents: number
  isPaid: boolean
  paidDate?: string
  billId?: string
  createdAt: string
}

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}/api${endpoint}`

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  // Members API
  async getMembers(): Promise<ApiMember[]> {
    return this.request('/members')
  }

  async createMember(data: { name: string; color: string }): Promise<ApiMember> {
    return this.request('/members', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteMember(id: string): Promise<{ success: boolean }> {
    return this.request(`/members/${id}`, {
      method: 'DELETE',
    })
  }

  // Bills API
  async getBills(): Promise<ApiBill[]> {
    return this.request('/bills')
  }

  async createBill(data: any): Promise<ApiBill> {
    return this.request('/bills', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateBill(id: string, data: any): Promise<ApiBill> {
    return this.request(`/bills/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteBill(id: string): Promise<{ success: boolean }> {
    return this.request(`/bills/${id}`, {
      method: 'DELETE',
    })
  }

  // Payments API
  async createPayment(data: any): Promise<ApiPayment> {
    return this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePayment(id: string, data: any): Promise<ApiPayment> {
    return this.request(`/payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deletePayment(id: string): Promise<{ success: boolean }> {
    return this.request(`/payments/${id}`, {
      method: 'DELETE',
    })
  }

  // Recurring Bills API
  async getRecurringBills(): Promise<ApiRecurringBill[]> {
    return this.request('/recurring-bills')
  }

  async createRecurringBill(data: any): Promise<ApiRecurringBill> {
    return this.request('/recurring-bills', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateRecurringBill(id: string, data: any): Promise<ApiRecurringBill> {
    return this.request(`/recurring-bills/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteRecurringBill(id: string): Promise<{ success: boolean }> {
    return this.request(`/recurring-bills/${id}`, {
      method: 'DELETE',
    })
  }

  // Mortgages API
  async getMortgages(): Promise<ApiMortgage[]> {
    return this.request('/mortgages')
  }

  async createMortgage(data: any): Promise<ApiMortgage> {
    return this.request('/mortgages', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateMortgage(id: string, data: any): Promise<ApiMortgage> {
    return this.request(`/mortgages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteMortgage(id: string): Promise<{ success: boolean }> {
    return this.request(`/mortgages/${id}`, {
      method: 'DELETE',
    })
  }

  // Mortgage Payments API
  async createMortgagePayment(data: any): Promise<ApiMortgagePayment> {
    return this.request('/mortgage-payments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateMortgagePayment(id: string, data: any): Promise<ApiMortgagePayment> {
    return this.request(`/mortgage-payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteMortgagePayment(id: string): Promise<{ success: boolean }> {
    return this.request(`/mortgage-payments/${id}`, {
      method: 'DELETE',
    })
  }

  // Financed Expenses API
  async getFinancedExpenses(): Promise<ApiFinancedExpense[]> {
    return this.request('/financed-expenses')
  }

  async getFinancedExpense(id: string): Promise<ApiFinancedExpense> {
    return this.request(`/financed-expenses/${id}`)
  }

  async createFinancedExpense(data: any): Promise<ApiFinancedExpense> {
    return this.request('/financed-expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateFinancedExpense(id: string, data: any): Promise<ApiFinancedExpense> {
    return this.request(`/financed-expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteFinancedExpense(id: string): Promise<{ success: boolean }> {
    return this.request(`/financed-expenses/${id}`, {
      method: 'DELETE',
    })
  }

  async getFinancedExpensePayments(id: string): Promise<ApiFinancedExpensePayment[]> {
    return this.request(`/financed-expenses/${id}/payments`)
  }

  async markFinancedExpensePaymentPaid(expenseId: string, paymentId: string, data: any): Promise<ApiFinancedExpensePayment> {
    return this.request(`/financed-expenses/${expenseId}/payments/${paymentId}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async unmarkFinancedExpensePaymentPaid(expenseId: string, paymentId: string): Promise<ApiFinancedExpensePayment> {
    return this.request(`/financed-expenses/${expenseId}/payments/${paymentId}/unmark-paid`, {
      method: 'POST',
    })
  }
}

export const apiClient = new ApiClient()