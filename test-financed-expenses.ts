#!/usr/bin/env tsx

/**
 * Comprehensive Financed Expense Integration Test Suite
 * Tests all financed expense API endpoints, financial calculations, and frontend integration
 */

import dotenv from 'dotenv'

dotenv.config()

const API_BASE = process.env.API_URL || 'http://localhost:8080'

interface TestResult {
  test: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  message: string
  data?: any
}

interface FinancedExpenseTestData {
  memberId?: string
  financedExpenseId?: string
  paymentId?: string
  billId?: string
}

class FinancedExpenseIntegrationTester {
  private results: TestResult[] = []
  private testData: FinancedExpenseTestData = {}

  private log(test: string, status: 'PASS' | 'FAIL' | 'SKIP', message: string, data?: any) {
    this.results.push({ test, status, message, data })
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏸️'
    console.log(`${icon} ${test}: ${message}`)
    if (data && status === 'FAIL') {
      console.log('   Error details:', JSON.stringify(data, null, 2))
    }
  }

  private async apiCall(method: string, endpoint: string, body?: any): Promise<any> {
    const url = `${API_BASE}/api${endpoint}`
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (body) {
      config.body = JSON.stringify(body)
    }

    const response = await fetch(url, config)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    return await response.json()
  }

  async runAllTests() {
    console.log('🧪 Starting Comprehensive Financed Expense Integration Test Suite\n')

    try {
      await this.setupTestData()
      await this.testFinancedExpenseAPI()
      await this.testFinancedExpensePayments()
      await this.testFinancialCalculations()
      await this.testEdgeCasesAndValidation()
      await this.testBillIntegration()
      await this.testDataConsistency()
      await this.testErrorHandling()
    } catch (error) {
      console.error('Test suite failed:', error)
    }

    this.printSummary()
  }

  async setupTestData() {
    console.log('\n🔧 Setting up test data')

    try {
      // Create test member for splits
      const testMember = await this.apiCall('POST', '/members', {
        name: 'Financed Test User',
        color: 'bg-purple-500'
      })

      if (testMember.id) {
        this.testData.memberId = testMember.id
        this.log('Setup Test Member', 'PASS', 'Test member created successfully')
      } else {
        this.log('Setup Test Member', 'FAIL', 'Failed to create test member', testMember)
      }
    } catch (error) {
      this.log('Setup Test Data', 'FAIL', `Setup failed: ${error.message}`, error)
    }
  }

  async testFinancedExpenseAPI() {
    console.log('\n💳 Testing Financed Expense API Endpoints')

    try {
      // GET /api/financed-expenses - Initial state
      const initialExpenses = await this.apiCall('GET', '/financed-expenses')
      this.log('GET Financed Expenses', 'PASS', `Retrieved ${initialExpenses.length} financed expenses`)

      // POST /api/financed-expenses - Create new financed expense
      const newExpense = {
        title: 'Test Best Buy TV',
        description: 'Test 65" Smart TV with 12-month financing',
        totalAmountCents: 149999, // $1,499.99
        interestRatePercent: 0.0, // Interest-free financing
        financingTermMonths: 12,
        purchaseDate: '2025-01-15',
        firstPaymentDate: '2025-02-15',
        isActive: true,
        splitMode: 'amount',
        splits: this.testData.memberId ? [
          { memberId: this.testData.memberId, value: 149999 }
        ] : []
      }

      const createdExpense = await this.apiCall('POST', '/financed-expenses', newExpense)

      if (createdExpense.id && createdExpense.title === newExpense.title) {
        this.testData.financedExpenseId = createdExpense.id
        this.log('POST Financed Expense', 'PASS', 'Financed expense created successfully')

        // Verify calculated monthly payment
        const expectedMonthlyPayment = Math.round(149999 / 12)
        if (createdExpense.monthlyPaymentCents === expectedMonthlyPayment) {
          this.log('Monthly Payment Calculation', 'PASS', `Monthly payment correctly calculated: $${expectedMonthlyPayment / 100}`)
        } else {
          this.log('Monthly Payment Calculation', 'FAIL', `Expected ${expectedMonthlyPayment}, got ${createdExpense.monthlyPaymentCents}`)
        }

        // Verify splits were created
        if (createdExpense.splits && createdExpense.splits.length > 0) {
          this.log('Financed Expense Splits', 'PASS', 'Splits created correctly')
        } else {
          this.log('Financed Expense Splits', 'FAIL', 'Splits not created', createdExpense)
        }
      } else {
        this.log('POST Financed Expense', 'FAIL', 'Created expense missing required fields', createdExpense)
      }

      // GET /api/financed-expenses/:id - Get specific expense
      if (this.testData.financedExpenseId) {
        const specificExpense = await this.apiCall('GET', `/financed-expenses/${this.testData.financedExpenseId}`)

        if (specificExpense.id === this.testData.financedExpenseId) {
          this.log('GET Specific Financed Expense', 'PASS', 'Individual expense retrieved successfully')

          // Verify payment schedule was generated
          if (specificExpense.payments && specificExpense.payments.length === 12) {
            this.log('Payment Schedule Generation', 'PASS', '12 payment schedule entries generated')
          } else {
            this.log('Payment Schedule Generation', 'FAIL', `Expected 12 payments, got ${specificExpense.payments?.length || 0}`)
          }

          // Verify summary calculations
          if (specificExpense.summary) {
            if (specificExpense.summary.totalPaidCents === 0 &&
                specificExpense.summary.remainingBalanceCents === 149999) {
              this.log('Financial Summary', 'PASS', 'Financial summary calculated correctly')
            } else {
              this.log('Financial Summary', 'FAIL', 'Financial summary calculations incorrect', specificExpense.summary)
            }
          }
        } else {
          this.log('GET Specific Financed Expense', 'FAIL', 'Individual expense retrieval failed')
        }
      }

      // PUT /api/financed-expenses/:id - Update expense
      if (this.testData.financedExpenseId) {
        const updatedExpense = await this.apiCall('PUT', `/financed-expenses/${this.testData.financedExpenseId}`, {
          title: 'Updated Test Best Buy TV',
          description: 'Updated description with extended warranty',
          totalAmountCents: 159999, // $1,599.99 (increased amount)
          interestRatePercent: 6.99, // Added interest rate
          financingTermMonths: 18, // Extended term
          isActive: true,
          splitMode: 'amount',
          splits: this.testData.memberId ? [
            { memberId: this.testData.memberId, value: 159999 }
          ] : []
        })

        if (updatedExpense.title === 'Updated Test Best Buy TV' &&
            updatedExpense.totalAmountCents === 159999) {
          this.log('PUT Financed Expense', 'PASS', 'Financed expense updated successfully')

          // Verify payment schedule recalculation
          const expectedNewMonthlyPayment = Math.round(
            this.calculateMonthlyPayment(159999, 6.99, 18)
          )

          if (Math.abs(updatedExpense.monthlyPaymentCents - expectedNewMonthlyPayment) <= 1) {
            this.log('Payment Recalculation', 'PASS', 'Payment schedule recalculated with interest')
          } else {
            this.log('Payment Recalculation', 'FAIL',
              `Expected ~${expectedNewMonthlyPayment}, got ${updatedExpense.monthlyPaymentCents}`)
          }
        } else {
          this.log('PUT Financed Expense', 'FAIL', 'Update failed', updatedExpense)
        }
      }

    } catch (error) {
      this.log('Financed Expense API', 'FAIL', `API test failed: ${error.message}`, error)
    }
  }

  async testFinancedExpensePayments() {
    console.log('\n💰 Testing Financed Expense Payment Management')

    if (!this.testData.financedExpenseId) {
      this.log('Payment Tests', 'SKIP', 'No financed expense available for payment testing')
      return
    }

    try {
      // GET /api/financed-expenses/:id/payments - Get payment schedule
      const payments = await this.apiCall('GET', `/financed-expenses/${this.testData.financedExpenseId}/payments`)

      if (payments && payments.length > 0) {
        this.log('GET Payment Schedule', 'PASS', `Retrieved ${payments.length} payment entries`)

        // Store first payment for testing
        this.testData.paymentId = payments[0].id

        // Verify payment structure
        const firstPayment = payments[0]
        const requiredFields = ['id', 'paymentNumber', 'dueDate', 'amountCents', 'principalCents', 'interestCents', 'isPaid']
        const missingFields = requiredFields.filter(field => !(field in firstPayment))

        if (missingFields.length === 0) {
          this.log('Payment Structure', 'PASS', 'Payment entries have all required fields')
        } else {
          this.log('Payment Structure', 'FAIL', `Missing fields: ${missingFields.join(', ')}`, firstPayment)
        }

        // Verify payment progression (payment numbers should be sequential)
        const paymentNumbers = payments.map(p => p.paymentNumber).sort((a, b) => a - b)
        const expectedNumbers = Array.from({ length: payments.length }, (_, i) => i + 1)

        if (JSON.stringify(paymentNumbers) === JSON.stringify(expectedNumbers)) {
          this.log('Payment Numbering', 'PASS', 'Payment numbers are sequential')
        } else {
          this.log('Payment Numbering', 'FAIL', 'Payment numbers are not sequential', {
            expected: expectedNumbers,
            actual: paymentNumbers
          })
        }

        // POST /api/financed-expenses/:id/payments/:paymentId/mark-paid - Mark payment as paid
        if (this.testData.paymentId) {
          const markedPayment = await this.apiCall('POST',
            `/financed-expenses/${this.testData.financedExpenseId}/payments/${this.testData.paymentId}/mark-paid`,
            {
              paidDate: '2025-02-15',
              createBill: true // Test bill creation functionality
            }
          )

          if (markedPayment.isPaid === true && markedPayment.paidDate === '2025-02-15') {
            this.log('Mark Payment Paid', 'PASS', 'Payment marked as paid successfully')

            // Verify bill was created if requested
            if (markedPayment.createdBillId) {
              this.testData.billId = markedPayment.createdBillId
              this.log('Bill Creation Integration', 'PASS', 'Bill created when marking payment as paid')
            }
          } else {
            this.log('Mark Payment Paid', 'FAIL', 'Payment not marked as paid correctly', markedPayment)
          }

          // Verify payment status update in full expense data
          const updatedExpense = await this.apiCall('GET', `/financed-expenses/${this.testData.financedExpenseId}`)
          const paidPayment = updatedExpense.payments?.find(p => p.id === this.testData.paymentId)

          if (paidPayment && paidPayment.isPaid) {
            this.log('Payment Status Persistence', 'PASS', 'Payment status persisted correctly')
          } else {
            this.log('Payment Status Persistence', 'FAIL', 'Payment status not persisted')
          }
        }
      } else {
        this.log('GET Payment Schedule', 'FAIL', 'No payment schedule found')
      }

    } catch (error) {
      this.log('Payment Management', 'FAIL', `Payment test failed: ${error.message}`, error)
    }
  }

  async testFinancialCalculations() {
    console.log('\n🧮 Testing Financial Calculations')

    try {
      // Test 0% interest calculation (simple division)
      const zeroInterestExpense = {
        title: 'Zero Interest Test',
        totalAmountCents: 120000, // $1,200
        interestRatePercent: 0.0,
        financingTermMonths: 12,
        purchaseDate: '2025-01-01',
        firstPaymentDate: '2025-02-01',
        splitMode: 'amount',
        splits: this.testData.memberId ? [
          { memberId: this.testData.memberId, value: 120000 }
        ] : []
      }

      const zeroInterestResult = await this.apiCall('POST', '/financed-expenses', zeroInterestExpense)
      const expectedZeroInterestPayment = 120000 / 12 // $100

      if (zeroInterestResult.monthlyPaymentCents === expectedZeroInterestPayment) {
        this.log('Zero Interest Calculation', 'PASS', 'Zero interest calculation correct')
      } else {
        this.log('Zero Interest Calculation', 'FAIL',
          `Expected ${expectedZeroInterestPayment}, got ${zeroInterestResult.monthlyPaymentCents}`)
      }

      // Test with interest calculation
      const interestExpense = {
        title: 'Interest Test',
        totalAmountCents: 100000, // $1,000
        interestRatePercent: 12.0, // 12% APR
        financingTermMonths: 12,
        purchaseDate: '2025-01-01',
        firstPaymentDate: '2025-02-01',
        splitMode: 'amount',
        splits: this.testData.memberId ? [
          { memberId: this.testData.memberId, value: 100000 }
        ] : []
      }

      const interestResult = await this.apiCall('POST', '/financed-expenses', interestExpense)
      const expectedInterestPayment = this.calculateMonthlyPayment(100000, 12.0, 12)

      // Allow for small rounding differences
      if (Math.abs(interestResult.monthlyPaymentCents - expectedInterestPayment) <= 1) {
        this.log('Interest Calculation', 'PASS', 'Interest calculation within acceptable range')
      } else {
        this.log('Interest Calculation', 'FAIL',
          `Expected ~${expectedInterestPayment}, got ${interestResult.monthlyPaymentCents}`)
      }

      // Test payment schedule amortization
      const interestPayments = await this.apiCall('GET', `/financed-expenses/${interestResult.id}/payments`)

      if (interestPayments && interestPayments.length > 0) {
        // First payment should have more interest than principal for typical loan
        const firstPayment = interestPayments[0]
        const lastPayment = interestPayments[interestPayments.length - 1]

        if (firstPayment.interestCents > 0 && lastPayment.interestCents >= 0) {
          this.log('Payment Amortization', 'PASS', 'Payment schedule includes interest/principal breakdown')
        } else {
          this.log('Payment Amortization', 'FAIL', 'Interest/principal breakdown incorrect')
        }

        // Verify total payments add up to original amount plus interest
        const totalPrincipal = interestPayments.reduce((sum, p) => sum + p.principalCents, 0)
        const totalInterest = interestPayments.reduce((sum, p) => sum + p.interestCents, 0)

        if (totalPrincipal === 100000) {
          this.log('Principal Amortization', 'PASS', 'Total principal equals original amount')
        } else {
          this.log('Principal Amortization', 'FAIL',
            `Expected 100000, total principal is ${totalPrincipal}`)
        }

        if (totalInterest > 0) {
          this.log('Interest Calculation', 'PASS', `Total interest calculated: $${totalInterest / 100}`)
        } else {
          this.log('Interest Calculation', 'FAIL', 'No interest calculated for non-zero rate')
        }
      }

      // Cleanup test expenses
      await this.apiCall('DELETE', `/financed-expenses/${zeroInterestResult.id}`)
      await this.apiCall('DELETE', `/financed-expenses/${interestResult.id}`)

    } catch (error) {
      this.log('Financial Calculations', 'FAIL', `Calculation test failed: ${error.message}`, error)
    }
  }

  async testEdgeCasesAndValidation() {
    console.log('\n🚨 Testing Edge Cases and Validation')

    try {
      // Test validation - missing required fields
      try {
        await this.apiCall('POST', '/financed-expenses', {
          title: 'Incomplete Expense'
          // Missing required fields
        })
        this.log('Required Field Validation', 'FAIL', 'Should reject incomplete data')
      } catch (error) {
        if (error.message.includes('400') || error.message.includes('Missing required fields')) {
          this.log('Required Field Validation', 'PASS', 'Properly validates required fields')
        } else {
          this.log('Required Field Validation', 'FAIL', `Unexpected error: ${error.message}`)
        }
      }

      // Test validation - negative amounts
      try {
        await this.apiCall('POST', '/financed-expenses', {
          title: 'Negative Amount Test',
          totalAmountCents: -1000,
          interestRatePercent: 0,
          financingTermMonths: 12,
          purchaseDate: '2025-01-01',
          firstPaymentDate: '2025-02-01',
          splitMode: 'amount',
          splits: []
        })
        this.log('Negative Amount Validation', 'FAIL', 'Should reject negative amounts')
      } catch (error) {
        if (error.message.includes('400') || error.message.includes('greater than 0')) {
          this.log('Negative Amount Validation', 'PASS', 'Properly validates positive amounts')
        } else {
          this.log('Negative Amount Validation', 'FAIL', `Unexpected error: ${error.message}`)
        }
      }

      // Test validation - negative interest rate
      try {
        await this.apiCall('POST', '/financed-expenses', {
          title: 'Negative Interest Test',
          totalAmountCents: 100000,
          interestRatePercent: -5.0,
          financingTermMonths: 12,
          purchaseDate: '2025-01-01',
          firstPaymentDate: '2025-02-01',
          splitMode: 'amount',
          splits: []
        })
        this.log('Negative Interest Validation', 'FAIL', 'Should reject negative interest rates')
      } catch (error) {
        if (error.message.includes('400') || error.message.includes('cannot be negative')) {
          this.log('Negative Interest Validation', 'PASS', 'Properly validates non-negative interest')
        } else {
          this.log('Negative Interest Validation', 'FAIL', `Unexpected error: ${error.message}`)
        }
      }

      // Test validation - invalid term length
      try {
        await this.apiCall('POST', '/financed-expenses', {
          title: 'Invalid Term Test',
          totalAmountCents: 100000,
          interestRatePercent: 0,
          financingTermMonths: 0,
          purchaseDate: '2025-01-01',
          firstPaymentDate: '2025-02-01',
          splitMode: 'amount',
          splits: []
        })
        this.log('Invalid Term Validation', 'FAIL', 'Should reject zero-length terms')
      } catch (error) {
        if (error.message.includes('400') || error.message.includes('greater than 0')) {
          this.log('Invalid Term Validation', 'PASS', 'Properly validates positive term length')
        } else {
          this.log('Invalid Term Validation', 'FAIL', `Unexpected error: ${error.message}`)
        }
      }

      // Test edge case - very large financing amount
      const largeAmountExpense = {
        title: 'Large Amount Test',
        totalAmountCents: 100000000, // $1,000,000
        interestRatePercent: 5.0,
        financingTermMonths: 240, // 20 years
        purchaseDate: '2025-01-01',
        firstPaymentDate: '2025-02-01',
        splitMode: 'amount',
        splits: this.testData.memberId ? [
          { memberId: this.testData.memberId, value: 100000000 }
        ] : []
      }

      const largeAmountResult = await this.apiCall('POST', '/financed-expenses', largeAmountExpense)

      if (largeAmountResult.id && largeAmountResult.monthlyPaymentCents > 0) {
        this.log('Large Amount Handling', 'PASS', 'Large amounts handled correctly')

        // Cleanup
        await this.apiCall('DELETE', `/financed-expenses/${largeAmountResult.id}`)
      } else {
        this.log('Large Amount Handling', 'FAIL', 'Large amounts not handled correctly')
      }

    } catch (error) {
      this.log('Edge Cases', 'FAIL', `Edge case testing failed: ${error.message}`, error)
    }
  }

  async testBillIntegration() {
    console.log('\n🔗 Testing Bill Integration')

    if (!this.testData.billId) {
      this.log('Bill Integration', 'SKIP', 'No bill created during payment testing')
      return
    }

    try {
      // Verify the created bill exists and has correct properties
      const bills = await this.apiCall('GET', '/bills')
      const createdBill = bills.find(b => b.id === this.testData.billId)

      if (createdBill) {
        this.log('Bill Creation Verification', 'PASS', 'Bill created and retrievable')

        // Verify bill properties match financed expense payment
        if (createdBill.name.includes('Test Best Buy TV') && createdBill.name.includes('Payment #1')) {
          this.log('Bill Naming Convention', 'PASS', 'Bill named correctly with expense and payment info')
        } else {
          this.log('Bill Naming Convention', 'FAIL', `Unexpected bill name: ${createdBill.name}`)
        }

        // Verify bill amount matches payment amount
        const expectedAmount = Math.round(159999 / 18) // From our updated expense
        const billAmountCents = createdBill.amountCents

        if (Math.abs(billAmountCents - expectedAmount) <= 100) { // Allow $1 variance for rounding
          this.log('Bill Amount Matching', 'PASS', 'Bill amount matches payment amount')
        } else {
          this.log('Bill Amount Matching', 'FAIL',
            `Expected ~${expectedAmount}, got ${billAmountCents}`)
        }

        // Verify bill splits match financed expense splits
        if (createdBill.splits && createdBill.splits.length > 0) {
          this.log('Bill Split Integration', 'PASS', 'Bill splits created from financed expense splits')
        } else {
          this.log('Bill Split Integration', 'FAIL', 'Bill splits not created correctly')
        }
      } else {
        this.log('Bill Creation Verification', 'FAIL', 'Created bill not found in bills list')
      }

    } catch (error) {
      this.log('Bill Integration', 'FAIL', `Bill integration test failed: ${error.message}`, error)
    }
  }

  async testDataConsistency() {
    console.log('\n🔍 Testing Data Consistency')

    try {
      // Verify all financed expenses are retrievable
      const allExpenses = await this.apiCall('GET', '/financed-expenses')
      this.log('Data Retrieval Consistency', 'PASS', `All ${allExpenses.length} financed expenses retrievable`)

      // Test individual expense retrieval consistency
      for (const expense of allExpenses) {
        try {
          const individualExpense = await this.apiCall('GET', `/financed-expenses/${expense.id}`)

          if (individualExpense.id === expense.id) {
            // Verify payment summary matches payment details
            const payments = await this.apiCall('GET', `/financed-expenses/${expense.id}/payments`)
            const paidCount = payments.filter(p => p.isPaid).length

            if (individualExpense.summary &&
                individualExpense.summary.paymentsRemaining === payments.length - paidCount) {
              this.log(`Payment Summary Consistency (${expense.title})`, 'PASS', 'Payment summary matches actual payments')
            } else {
              this.log(`Payment Summary Consistency (${expense.title})`, 'FAIL', 'Payment summary inconsistent')
            }
          }
        } catch (error) {
          this.log(`Individual Retrieval (${expense.title})`, 'FAIL', `Individual expense retrieval failed: ${error.message}`)
        }
      }

      // Test payment schedule consistency
      if (this.testData.financedExpenseId) {
        const expense = await this.apiCall('GET', `/financed-expenses/${this.testData.financedExpenseId}`)
        const payments = await this.apiCall('GET', `/financed-expenses/${this.testData.financedExpenseId}/payments`)

        if (expense.payments && payments) {
          if (expense.payments.length === payments.length) {
            this.log('Payment Schedule Consistency', 'PASS', 'Payment schedules match across endpoints')
          } else {
            this.log('Payment Schedule Consistency', 'FAIL',
              `Expense has ${expense.payments.length} payments, payments endpoint has ${payments.length}`)
          }
        }
      }

    } catch (error) {
      this.log('Data Consistency', 'FAIL', `Consistency test failed: ${error.message}`, error)
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling')

    try {
      // Test 404 for non-existent financed expense
      try {
        await this.apiCall('GET', '/financed-expenses/nonexistent-id')
        this.log('404 Error Handling', 'FAIL', 'Should return 404 for non-existent expense')
      } catch (error) {
        if (error.message.includes('404')) {
          this.log('404 Error Handling', 'PASS', '404 error properly handled')
        } else {
          this.log('404 Error Handling', 'FAIL', `Unexpected error: ${error.message}`)
        }
      }

      // Test marking non-existent payment as paid
      if (this.testData.financedExpenseId) {
        try {
          await this.apiCall('POST',
            `/financed-expenses/${this.testData.financedExpenseId}/payments/nonexistent-payment/mark-paid`,
            { paidDate: '2025-01-01' }
          )
          this.log('Payment 404 Handling', 'FAIL', 'Should return 404 for non-existent payment')
        } catch (error) {
          if (error.message.includes('404')) {
            this.log('Payment 404 Handling', 'PASS', 'Payment 404 error properly handled')
          } else {
            this.log('Payment 404 Handling', 'FAIL', `Unexpected error: ${error.message}`)
          }
        }
      }

      // Test updating non-existent financed expense
      try {
        await this.apiCall('PUT', '/financed-expenses/nonexistent-id', {
          title: 'Should Fail'
        })
        this.log('Update 404 Handling', 'FAIL', 'Should return 404 for update of non-existent expense')
      } catch (error) {
        if (error.message.includes('404')) {
          this.log('Update 404 Handling', 'PASS', 'Update 404 error properly handled')
        } else {
          this.log('Update 404 Handling', 'FAIL', `Unexpected error: ${error.message}`)
        }
      }

      // Test marking already paid payment as paid again
      if (this.testData.financedExpenseId && this.testData.paymentId) {
        try {
          await this.apiCall('POST',
            `/financed-expenses/${this.testData.financedExpenseId}/payments/${this.testData.paymentId}/mark-paid`,
            { paidDate: '2025-01-01' }
          )
          this.log('Double Payment Handling', 'FAIL', 'Should reject marking already-paid payment')
        } catch (error) {
          if (error.message.includes('400') || error.message.includes('already')) {
            this.log('Double Payment Handling', 'PASS', 'Double payment properly rejected')
          } else {
            this.log('Double Payment Handling', 'FAIL', `Unexpected error: ${error.message}`)
          }
        }
      }

    } catch (error) {
      this.log('Error Handling', 'FAIL', `Error handling test failed: ${error.message}`, error)
    }
  }

  // Helper function to calculate monthly payment (matching server-side logic)
  private calculateMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
    if (annualRate === 0) {
      return principal / termMonths
    }

    const monthlyRate = annualRate / 100 / 12
    const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)
    const denominator = Math.pow(1 + monthlyRate, termMonths) - 1
    return Math.round(numerator / denominator)
  }

  async cleanupTestData() {
    console.log('\n🧹 Cleaning up test data')

    try {
      // Delete test bill if created
      if (this.testData.billId) {
        await this.apiCall('DELETE', `/bills/${this.testData.billId}`)
        this.log('Cleanup Bill', 'PASS', 'Test bill deleted')
      }

      // Delete test financed expense
      if (this.testData.financedExpenseId) {
        await this.apiCall('DELETE', `/financed-expenses/${this.testData.financedExpenseId}`)
        this.log('Cleanup Financed Expense', 'PASS', 'Test financed expense deleted')
      }

      // Delete test member
      if (this.testData.memberId) {
        await this.apiCall('DELETE', `/members/${this.testData.memberId}`)
        this.log('Cleanup Member', 'PASS', 'Test member deleted')
      }

    } catch (error) {
      this.log('Cleanup', 'FAIL', `Cleanup failed: ${error.message}`, error)
    }
  }

  printSummary() {
    console.log('\n📊 Financed Expense Test Summary')
    console.log('================================')

    const passed = this.results.filter(r => r.status === 'PASS').length
    const failed = this.results.filter(r => r.status === 'FAIL').length
    const skipped = this.results.filter(r => r.status === 'SKIP').length

    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`⏸️ Skipped: ${skipped}`)
    console.log(`📈 Total: ${this.results.length}`)

    if (failed > 0) {
      console.log('\n❌ Failed Tests:')
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`   - ${r.test}: ${r.message}`))
    }

    const successRate = ((passed / (passed + failed)) * 100).toFixed(1)
    console.log(`\n📊 Success Rate: ${successRate}%`)
    console.log(`${failed === 0 ? '🎉 All tests passed!' : '⚠️ Some tests failed!'}`)

    // Deployment readiness assessment
    if (failed === 0 && passed >= 20) {
      console.log('\n🚀 DEPLOYMENT READY: All financed expense tests passed!')
    } else if (failed <= 2 && passed >= 15) {
      console.log('\n⚠️ DEPLOYMENT WITH CAUTION: Minor issues detected, review failures')
    } else {
      console.log('\n🚫 NOT READY FOR DEPLOYMENT: Critical issues detected')
    }
  }
}

// Run the test suite
async function main() {
  const tester = new FinancedExpenseIntegrationTester()

  try {
    await tester.runAllTests()
  } finally {
    await tester.cleanupTestData()
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { FinancedExpenseIntegrationTester }