import { useState, useEffect, useCallback } from 'react'
import { apiClient, ApiMember, ApiBill, ApiRecurringBill, ApiPayment, ApiMortgage, ApiMortgagePayment } from '../utils/api'
import { Person, Bill, RecurringBill, Payment, Mortgage, MortgagePayment, MortgagePaymentBreakdown } from '../types'

// Default data for empty database or offline scenarios
const DEFAULT_PEOPLE: Person[] = [
  { id: '1', name: 'Alex', color: 'bg-blue-500' },
  { id: '2', name: 'Beth', color: 'bg-pink-500' },
]

// Type mapping utilities - Convert between frontend and API types

// Person <-> ApiMember mapping
function personToApiMember(person: Person): Omit<ApiMember, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: person.name,
    color: person.color
  }
}

function apiMemberToPerson(apiMember: ApiMember): Person {
  return {
    id: apiMember.id,
    name: apiMember.name,
    color: apiMember.color
  }
}

// Bill <-> ApiBill mapping
function billToApiBill(bill: Bill): any {
  return {
    name: bill.name,
    amountCents: Math.round(bill.amount * 100),
    dueDate: bill.dueDate,
    recurringBillId: bill.recurringBillId,
    period: bill.period,
    splitMode: bill.splitMode,
    splits: bill.splits.map(split => ({
      memberId: split.personId,
      value: split.value
    }))
  }
}

function apiBillToBill(apiBill: ApiBill): Bill {
  return {
    id: apiBill.id,
    name: apiBill.name,
    amount: apiBill.amountCents / 100,
    dueDate: apiBill.dueDate,
    recurringBillId: apiBill.recurringBillId,
    period: apiBill.period,
    splitMode: apiBill.splitMode as any,
    splits: apiBill.splits.map(split => ({
      personId: split.memberId,
      value: split.value
    }))
  }
}

// RecurringBill <-> ApiRecurringBill mapping
function recurringBillToApiRecurringBill(bill: RecurringBill): any {
  return {
    name: bill.name,
    amountCents: Math.round(bill.amount * 100),
    dayOfMonth: bill.dayOfMonth,
    frequency: bill.frequency,
    lastGeneratedPeriod: bill.lastGeneratedPeriod,
    splitMode: bill.splitMode,
    splits: bill.splits.map(split => ({
      memberId: split.personId,
      value: split.value
    }))
  }
}

function apiRecurringBillToRecurringBill(apiRB: ApiRecurringBill): RecurringBill {
  return {
    id: apiRB.id,
    name: apiRB.name,
    amount: apiRB.amountCents / 100,
    dayOfMonth: apiRB.dayOfMonth,
    frequency: apiRB.frequency as any,
    lastGeneratedPeriod: apiRB.lastGeneratedPeriod,
    splitMode: apiRB.splitMode as any,
    splits: apiRB.splits.map(split => ({
      personId: split.memberId,
      value: split.value
    }))
  }
}

// Payment <-> ApiPayment mapping
function paymentToApiPayment(payment: Payment): any {
  return {
    billId: payment.billId,
    paidDate: payment.paidDate,
    amountCents: Math.round(payment.amount * 100),
    method: payment.method,
    payerMemberId: payment.payerPersonId,
    note: payment.note,
    receiptFilename: payment.receipt?.fileName,
    receiptData: payment.receipt?.dataUrl,
    allocations: payment.allocations?.map(alloc => ({
      memberId: alloc.personId,
      amountCents: Math.round(alloc.amount * 100)
    })) || []
  }
}

function apiPaymentToPayment(apiPayment: ApiPayment): Payment {
  return {
    id: apiPayment.id,
    billId: apiPayment.billId,
    paidDate: apiPayment.paidDate,
    amount: apiPayment.amountCents / 100,
    method: apiPayment.method as any,
    payerPersonId: apiPayment.payerMemberId,
    note: apiPayment.note,
    receipt: apiPayment.receiptFilename && apiPayment.receiptData ? {
      fileName: apiPayment.receiptFilename,
      dataUrl: apiPayment.receiptData
    } : undefined,
    allocations: apiPayment.allocations?.map(alloc => ({
      personId: alloc.memberId,
      amount: alloc.amountCents / 100
    }))
  }
}

// Mortgage <-> ApiMortgage mapping
function mortgageToApiMortgage(mortgage: Mortgage): any {
  return {
    name: mortgage.name,
    lender: mortgage.lender,
    isPrimary: mortgage.is_primary || false,
    originalPrincipalCents: Math.round(mortgage.original_principal * 100),
    currentPrincipalCents: Math.round(mortgage.current_principal * 100),
    interestRateApy: mortgage.interest_rate_apy,
    termMonths: mortgage.term_months,
    startDate: mortgage.start_date,
    scheduledPaymentCents: Math.round(mortgage.scheduled_payment * 100),
    paymentDay: mortgage.payment_day,
    escrowEnabled: mortgage.escrow_enabled,
    escrowTaxesCents: mortgage.escrow_taxes ? Math.round(mortgage.escrow_taxes * 100) : undefined,
    escrowInsuranceCents: mortgage.escrow_insurance ? Math.round(mortgage.escrow_insurance * 100) : undefined,
    escrowMipCents: mortgage.escrow_mip ? Math.round(mortgage.escrow_mip * 100) : undefined,
    escrowHoaCents: mortgage.escrow_hoa ? Math.round(mortgage.escrow_hoa * 100) : undefined,
    notes: mortgage.notes,
    active: mortgage.active,
    splitMode: mortgage.splitMode,
    splits: mortgage.splits.map(split => ({
      memberId: split.personId,
      value: split.value
    }))
  }
}

function apiMortgageToMortgage(apiMortgage: ApiMortgage): Mortgage {
  // Defensive type checking and safe conversion
  const safeNumber = (value: any, fallback: number = 0): number => {
    if (typeof value === 'number' && !isNaN(value)) return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return !isNaN(parsed) ? parsed : fallback
    }
    console.warn('Invalid numeric value for mortgage field:', value)
    return fallback
  }

  const safeCentsTodollars = (cents: any, fallback: number = 0): number => {
    const safeCents = safeNumber(cents, fallback * 100)
    return safeCents / 100
  }

  return {
    id: apiMortgage.id || '',
    name: apiMortgage.name || 'Unknown Mortgage',
    lender: apiMortgage.lender,
    is_primary: Boolean(apiMortgage.isPrimary),
    original_principal: safeCentsTodollars(apiMortgage.originalPrincipalCents, 0),
    current_principal: safeCentsTodollars(apiMortgage.currentPrincipalCents, 0),
    interest_rate_apy: safeNumber(apiMortgage.interestRateApy, 0),
    term_months: safeNumber(apiMortgage.termMonths, 360),
    start_date: apiMortgage.startDate || new Date().toISOString(),
    scheduled_payment: safeCentsTodollars(apiMortgage.scheduledPaymentCents, 0),
    payment_day: safeNumber(apiMortgage.paymentDay, 1),
    escrow_enabled: Boolean(apiMortgage.escrowEnabled),
    escrow_taxes: apiMortgage.escrowTaxesCents ? safeCentsTodollars(apiMortgage.escrowTaxesCents) : undefined,
    escrow_insurance: apiMortgage.escrowInsuranceCents ? safeCentsTodollars(apiMortgage.escrowInsuranceCents) : undefined,
    escrow_mip: apiMortgage.escrowMipCents ? safeCentsTodollars(apiMortgage.escrowMipCents) : undefined,
    escrow_hoa: apiMortgage.escrowHoaCents ? safeCentsTodollars(apiMortgage.escrowHoaCents) : undefined,
    notes: apiMortgage.notes,
    active: Boolean(apiMortgage.active),
    splitMode: apiMortgage.splitMode as any,
    splits: (apiMortgage.splits || []).map(split => ({
      personId: split.memberId || '',
      value: safeNumber(split.value, 0)
    }))
  }
}

// MortgagePayment <-> ApiMortgagePayment mapping
function mortgagePaymentToApiMortgagePayment(payment: MortgagePayment): any {
  return {
    mortgageId: payment.mortgageId,
    paidDate: payment.paidDate,
    amountCents: Math.round(payment.amount * 100),
    method: payment.method,
    payerMemberId: payment.payerPersonId,
    note: payment.note,
    receiptFilename: payment.receipt?.fileName,
    receiptData: payment.receipt?.dataUrl,
    allocations: payment.allocations?.map(alloc => ({
      memberId: alloc.personId,
      amountCents: Math.round(alloc.amount * 100)
    })) || []
  }
}

function apiMortgagePaymentToMortgagePayment(apiPayment: ApiMortgagePayment): MortgagePayment {
  return {
    id: apiPayment.id,
    mortgageId: apiPayment.mortgageId,
    paidDate: apiPayment.paidDate,
    amount: apiPayment.amountCents / 100,
    method: apiPayment.method as any,
    payerPersonId: apiPayment.payerMemberId,
    note: apiPayment.note,
    receipt: apiPayment.receiptFilename && apiPayment.receiptData ? {
      fileName: apiPayment.receiptFilename,
      dataUrl: apiPayment.receiptData
    } : undefined,
    allocations: apiPayment.allocations?.map(alloc => ({
      personId: alloc.memberId,
      amount: alloc.amountCents / 100
    }))
  }
}

// Generic hook type - changed error to warning to indicate non-blocking
type ApiHookResult<T> = [T[], (data: T[]) => void, boolean, string | null]

// Members hook with fault tolerance
export function useMembers(): ApiHookResult<Person> {
  const [data, setData] = useState<Person[]>(DEFAULT_PEOPLE)
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const apiMembers = await apiClient.getMembers()

      // If API returns data, use it; otherwise keep defaults
      if (apiMembers && apiMembers.length > 0) {
        setData(apiMembers.map(apiMemberToPerson))
        setWarning(null)
      } else {
        // Empty database - keep defaults but show info
        setWarning('Using default family members. Add your own in the People section.')
      }
    } catch (err) {
      // API failure - keep defaults and show warning
      setWarning('Unable to connect to server. Working offline with default data.')
      console.warn('API fetch failed, using defaults:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: Person[]) => {
    setData(newData)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Bills hook with fault tolerance
export function useBills(): ApiHookResult<Bill> {
  const [data, setData] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const apiBills = await apiClient.getBills()
      setData(apiBills.map(apiBillToBill))
      setWarning(null)
    } catch (err) {
      setWarning('Unable to load bills from server. You can still add new bills.')
      console.warn('Bills fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: Bill[]) => {
    setData(newData)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Recurring Bills hook with fault tolerance
export function useRecurringBills(): ApiHookResult<RecurringBill> {
  const [data, setData] = useState<RecurringBill[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const apiRBs = await apiClient.getRecurringBills()
      setData(apiRBs.map(apiRecurringBillToRecurringBill))
      setWarning(null)
    } catch (err) {
      setWarning('Unable to load recurring bills from server. You can still create new ones.')
      console.warn('Recurring bills fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: RecurringBill[]) => {
    setData(newData)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Payments hook with fault tolerance
export function usePayments(): ApiHookResult<Payment> {
  const [data, setData] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      // Get payments from bills endpoint since payments are nested
      const apiBills = await apiClient.getBills()
      const allPayments: Payment[] = []
      apiBills.forEach(bill => {
        if (bill.payments) {
          allPayments.push(...bill.payments.map(apiPaymentToPayment))
        }
      })
      setData(allPayments)
      setWarning(null)
    } catch (err) {
      setWarning('Unable to load payments from server. You can still record new payments.')
      console.warn('Payments fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: Payment[]) => {
    setData(newData)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Mortgages hook with fault tolerance
export function useMortgages(): ApiHookResult<Mortgage> {
  const [data, setData] = useState<Mortgage[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const apiMortgages = await apiClient.getMortgages()

      // Validate and safely convert API response
      if (!Array.isArray(apiMortgages)) {
        console.warn('Invalid mortgages response format:', apiMortgages)
        setData([])
        setWarning('Invalid mortgage data format received from server.')
        return
      }

      const validMortgages = apiMortgages
        .filter(mortgage => {
          if (!mortgage || typeof mortgage !== 'object') {
            console.warn('Invalid mortgage object:', mortgage)
            return false
          }
          return true
        })
        .map(mortgage => {
          try {
            return apiMortgageToMortgage(mortgage)
          } catch (conversionError) {
            console.warn('Failed to convert mortgage:', mortgage, conversionError)
            return null
          }
        })
        .filter((mortgage): mortgage is Mortgage => mortgage !== null)

      setData(validMortgages)
      setWarning(null)

      if (validMortgages.length < apiMortgages.length) {
        setWarning('Some mortgage data could not be loaded due to format issues.')
      }
    } catch (err) {
      console.warn('Mortgages fetch failed:', err)
      setWarning('Unable to load mortgages from server. You can still add new mortgages.')
      setData([]) // Ensure we have valid state
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: Mortgage[]) => {
    // Validate new data before setting
    if (Array.isArray(newData)) {
      setData(newData)
    } else {
      console.warn('Invalid data passed to updateData:', newData)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Mortgage Payments hook with fault tolerance
export function useMortgagePayments(): ApiHookResult<MortgagePayment> {
  const [data, setData] = useState<MortgagePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      // Get mortgage payments from mortgages endpoint since payments are nested
      const apiMortgages = await apiClient.getMortgages()
      const allPayments: MortgagePayment[] = []
      apiMortgages.forEach(mortgage => {
        if (mortgage.payments) {
          allPayments.push(...mortgage.payments.map(apiMortgagePaymentToMortgagePayment))
        }
      })
      setData(allPayments)
      setWarning(null)
    } catch (err) {
      setWarning('Unable to load mortgage payments from server. You can still record new payments.')
      console.warn('Mortgage payments fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: MortgagePayment[]) => {
    setData(newData)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Mortgage Payment Breakdowns hook with fault tolerance
export function useMortgagePaymentBreakdowns(): ApiHookResult<MortgagePaymentBreakdown> {
  const [data, setData] = useState<MortgagePaymentBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      // Get breakdowns from mortgages endpoint since they're nested in payments
      const apiMortgages = await apiClient.getMortgages()
      const allBreakdowns: MortgagePaymentBreakdown[] = []
      apiMortgages.forEach(mortgage => {
        if (mortgage.payments) {
          mortgage.payments.forEach(payment => {
            if (payment.breakdown) {
              allBreakdowns.push({
                id: payment.breakdown.id,
                paymentId: payment.breakdown.paymentId,
                mortgageId: payment.breakdown.mortgageId,
                principal: payment.breakdown.principalCents / 100,
                interest: payment.breakdown.interestCents / 100,
                escrow: payment.breakdown.escrowCents / 100
              })
            }
          })
        }
      })
      setData(allBreakdowns)
      setWarning(null)
    } catch (err) {
      setWarning('Unable to load payment breakdowns from server.')
      console.warn('Mortgage payment breakdowns fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateData = useCallback(async (newData: MortgagePaymentBreakdown[]) => {
    setData(newData)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return [data, updateData, loading, warning]
}

// Utility functions for individual operations
export const apiOperations = {
  // Members
  async createMember(person: Person): Promise<Person> {
    const apiMember = await apiClient.createMember(personToApiMember(person))
    return apiMemberToPerson(apiMember)
  },

  async deleteMember(id: string): Promise<void> {
    await apiClient.deleteMember(id)
  },

  // Bills
  async createBill(bill: Bill): Promise<Bill> {
    const apiBill = await apiClient.createBill(billToApiBill(bill))
    return apiBillToBill(apiBill)
  },

  async updateBill(bill: Bill): Promise<Bill> {
    const apiBill = await apiClient.updateBill(bill.id, billToApiBill(bill))
    return apiBillToBill(apiBill)
  },

  async deleteBill(id: string): Promise<void> {
    await apiClient.deleteBill(id)
  },

  // Payments
  async createPayment(payment: Payment): Promise<Payment> {
    const apiPayment = await apiClient.createPayment(paymentToApiPayment(payment))
    return apiPaymentToPayment(apiPayment)
  },

  async updatePayment(payment: Payment): Promise<Payment> {
    const apiPayment = await apiClient.updatePayment(payment.id, paymentToApiPayment(payment))
    return apiPaymentToPayment(apiPayment)
  },

  async deletePayment(id: string): Promise<void> {
    await apiClient.deletePayment(id)
  },

  // Recurring Bills
  async createRecurringBill(recurringBill: RecurringBill): Promise<RecurringBill> {
    const apiRB = await apiClient.createRecurringBill(recurringBillToApiRecurringBill(recurringBill))
    return apiRecurringBillToRecurringBill(apiRB)
  },

  async updateRecurringBill(recurringBill: RecurringBill): Promise<RecurringBill> {
    const apiRB = await apiClient.updateRecurringBill(recurringBill.id, recurringBillToApiRecurringBill(recurringBill))
    return apiRecurringBillToRecurringBill(apiRB)
  },

  async deleteRecurringBill(id: string): Promise<void> {
    await apiClient.deleteRecurringBill(id)
  },

  // Mortgages
  async createMortgage(mortgage: Mortgage): Promise<Mortgage> {
    const apiMortgage = await apiClient.createMortgage(mortgageToApiMortgage(mortgage))
    return apiMortgageToMortgage(apiMortgage)
  },

  async updateMortgage(mortgage: Mortgage): Promise<Mortgage> {
    const apiMortgage = await apiClient.updateMortgage(mortgage.id, mortgageToApiMortgage(mortgage))
    return apiMortgageToMortgage(apiMortgage)
  },

  async deleteMortgage(id: string): Promise<void> {
    await apiClient.deleteMortgage(id)
  },

  // Mortgage Payments
  async createMortgagePayment(payment: MortgagePayment): Promise<MortgagePayment> {
    const apiPayment = await apiClient.createMortgagePayment(mortgagePaymentToApiMortgagePayment(payment))
    return apiMortgagePaymentToMortgagePayment(apiPayment)
  },

  async updateMortgagePayment(payment: MortgagePayment): Promise<MortgagePayment> {
    const apiPayment = await apiClient.updateMortgagePayment(payment.id, mortgagePaymentToApiMortgagePayment(payment))
    return apiMortgagePaymentToMortgagePayment(apiPayment)
  },

  async deleteMortgagePayment(id: string): Promise<void> {
    await apiClient.deleteMortgagePayment(id)
  }
}