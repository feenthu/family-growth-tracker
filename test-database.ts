#!/usr/bin/env tsx

/**
 * Comprehensive Database Test Suite
 * Tests all database interactions and API endpoints
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

class DatabaseTester {
  private results: TestResult[] = []
  private testData: any = {}

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
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    return await response.json()
  }

  async runAllTests() {
    console.log('🧪 Starting Comprehensive Database Test Suite\n')

    try {
      await this.testHealthEndpoint()
      await this.testMembersAPI()
      await this.testBillsAPI()
      await this.testPaymentsAPI()
      await this.testRecurringBillsAPI()
      await this.testMortgagesAPI()
      await this.testSettingsAPI()
      await this.testDataConsistency()
      await this.testErrorHandling()
    } catch (error) {
      console.error('Test suite failed:', error)
    }

    this.printSummary()
  }

  async testHealthEndpoint() {
    console.log('\n🏥 Testing Health Endpoint')

    try {
      const health = await this.apiCall('GET', '/health')

      if (health.status === 'ok' && health.database === 'connected') {
        this.log('Health Check', 'PASS', 'Database connection verified')
      } else {
        this.log('Health Check', 'FAIL', 'Health check returned unexpected response', health)
      }
    } catch (error) {
      this.log('Health Check', 'FAIL', `Health endpoint failed: ${error.message}`, error)
    }
  }

  async testMembersAPI() {
    console.log('\n👥 Testing Members API')

    try {
      // GET all members
      const initialMembers = await this.apiCall('GET', '/members')
      this.log('Members GET', 'PASS', `Retrieved ${initialMembers.length} members`)

      // POST new member
      const newMember = {
        name: 'Test User',
        color: 'bg-red-500'
      }

      const createdMember = await this.apiCall('POST', '/members', newMember)

      if (createdMember.id && createdMember.name === newMember.name) {
        this.log('Members POST', 'PASS', 'Member created successfully')
        this.testData.memberId = createdMember.id
      } else {
        this.log('Members POST', 'FAIL', 'Created member missing required fields', createdMember)
      }

      // PUT update member
      const updatedMember = await this.apiCall('PUT', `/members/${createdMember.id}`, {
        ...createdMember,
        name: 'Updated Test User'
      })

      if (updatedMember.name === 'Updated Test User') {
        this.log('Members PUT', 'PASS', 'Member updated successfully')
      } else {
        this.log('Members PUT', 'FAIL', 'Member update failed', updatedMember)
      }

      // Verify GET after update
      const allMembers = await this.apiCall('GET', '/members')
      const updatedInList = allMembers.find(m => m.id === createdMember.id)

      if (updatedInList && updatedInList.name === 'Updated Test User') {
        this.log('Members GET After Update', 'PASS', 'Updated member appears in list')
      } else {
        this.log('Members GET After Update', 'FAIL', 'Updated member not found in list')
      }

    } catch (error) {
      this.log('Members API', 'FAIL', `Members API test failed: ${error.message}`, error)
    }
  }

  async testBillsAPI() {
    console.log('\n💰 Testing Bills API')

    try {
      // GET all bills
      const initialBills = await this.apiCall('GET', '/bills')
      this.log('Bills GET', 'PASS', `Retrieved ${initialBills.length} bills`)

      // POST new bill
      const newBill = {
        name: 'Test Bill',
        amount: 100.50,
        dueDate: '2025-12-31',
        splitMode: 'amount',
        splits: this.testData.memberId ? [
          { personId: this.testData.memberId, value: 100.50 }
        ] : []
      }

      const createdBill = await this.apiCall('POST', '/bills', newBill)

      if (createdBill.id && createdBill.name === newBill.name) {
        this.log('Bills POST', 'PASS', 'Bill created successfully')
        this.testData.billId = createdBill.id

        // Verify splits were created
        if (createdBill.splits && createdBill.splits.length > 0) {
          this.log('Bills Splits', 'PASS', 'Bill splits created correctly')
        } else {
          this.log('Bills Splits', 'FAIL', 'Bill splits not created', createdBill)
        }
      } else {
        this.log('Bills POST', 'FAIL', 'Created bill missing required fields', createdBill)
      }

      // PUT update bill
      const updatedBill = await this.apiCall('PUT', `/bills/${createdBill.id}`, {
        ...createdBill,
        name: 'Updated Test Bill',
        amount: 200.75
      })

      if (updatedBill.name === 'Updated Test Bill' && updatedBill.amount === 200.75) {
        this.log('Bills PUT', 'PASS', 'Bill updated successfully')
      } else {
        this.log('Bills PUT', 'FAIL', 'Bill update failed', updatedBill)
      }

    } catch (error) {
      this.log('Bills API', 'FAIL', `Bills API test failed: ${error.message}`, error)
    }
  }

  async testPaymentsAPI() {
    console.log('\n💳 Testing Payments API')

    if (!this.testData.billId || !this.testData.memberId) {
      this.log('Payments API', 'SKIP', 'Skipping payments test - no test bill or member available')
      return
    }

    try {
      // POST new payment
      const newPayment = {
        billId: this.testData.billId,
        paidDate: '2025-12-31',
        amount: 100.50,
        method: 'card',
        payerPersonId: this.testData.memberId,
        note: 'Test payment',
        allocations: [
          { personId: this.testData.memberId, amount: 100.50 }
        ]
      }

      const createdPayment = await this.apiCall('POST', '/payments', newPayment)

      if (createdPayment.id && createdPayment.billId === newPayment.billId) {
        this.log('Payments POST', 'PASS', 'Payment created successfully')
        this.testData.paymentId = createdPayment.id

        // Verify allocations were created
        if (createdPayment.allocations && createdPayment.allocations.length > 0) {
          this.log('Payment Allocations', 'PASS', 'Payment allocations created correctly')
        } else {
          this.log('Payment Allocations', 'FAIL', 'Payment allocations not created', createdPayment)
        }
      } else {
        this.log('Payments POST', 'FAIL', 'Created payment missing required fields', createdPayment)
      }

      // PUT update payment
      if (this.testData.paymentId) {
        const updatedPayment = await this.apiCall('PUT', `/payments/${this.testData.paymentId}`, {
          ...createdPayment,
          note: 'Updated test payment',
          amount: 150.75
        })

        if (updatedPayment.note === 'Updated test payment' && updatedPayment.amount === 150.75) {
          this.log('Payments PUT', 'PASS', 'Payment updated successfully')
        } else {
          this.log('Payments PUT', 'FAIL', 'Payment update failed', updatedPayment)
        }
      }

    } catch (error) {
      this.log('Payments API', 'FAIL', `Payments API test failed: ${error.message}`, error)
    }
  }

  async testRecurringBillsAPI() {
    console.log('\n🔄 Testing Recurring Bills API')

    try {
      // GET all recurring bills
      const initialRecurringBills = await this.apiCall('GET', '/recurring-bills')
      this.log('Recurring Bills GET', 'PASS', `Retrieved ${initialRecurringBills.length} recurring bills`)

      // POST new recurring bill
      const newRecurringBill = {
        name: 'Test Recurring Bill',
        amount: 50.25,
        dayOfMonth: 15,
        frequency: 'monthly',
        lastGeneratedPeriod: '2025-11',
        splitMode: 'amount',
        splits: this.testData.memberId ? [
          { personId: this.testData.memberId, value: 50.25 }
        ] : []
      }

      const createdRecurringBill = await this.apiCall('POST', '/recurring-bills', newRecurringBill)

      if (createdRecurringBill.id && createdRecurringBill.name === newRecurringBill.name) {
        this.log('Recurring Bills POST', 'PASS', 'Recurring bill created successfully')
        this.testData.recurringBillId = createdRecurringBill.id
      } else {
        this.log('Recurring Bills POST', 'FAIL', 'Created recurring bill missing required fields', createdRecurringBill)
      }

      // PUT update recurring bill
      const updatedRecurringBill = await this.apiCall('PUT', `/recurring-bills/${createdRecurringBill.id}`, {
        ...createdRecurringBill,
        name: 'Updated Test Recurring Bill',
        amount: 75.50
      })

      if (updatedRecurringBill.name === 'Updated Test Recurring Bill' && updatedRecurringBill.amount === 75.50) {
        this.log('Recurring Bills PUT', 'PASS', 'Recurring bill updated successfully')
      } else {
        this.log('Recurring Bills PUT', 'FAIL', 'Recurring bill update failed', updatedRecurringBill)
      }

    } catch (error) {
      this.log('Recurring Bills API', 'FAIL', `Recurring Bills API test failed: ${error.message}`, error)
    }
  }

  async testMortgagesAPI() {
    console.log('\n🏠 Testing Mortgages API')

    try {
      // GET all mortgages
      const initialMortgages = await this.apiCall('GET', '/mortgages')
      this.log('Mortgages GET', 'PASS', `Retrieved ${initialMortgages.length} mortgages`)

      // Verify data format of existing mortgages
      if (initialMortgages.length > 0) {
        const mortgage = initialMortgages[0]
        const requiredFields = ['id', 'name', 'original_principal', 'current_principal', 'scheduled_payment', 'splits']
        const missingFields = requiredFields.filter(field => !(field in mortgage))

        if (missingFields.length === 0) {
          this.log('Mortgage Data Format', 'PASS', 'Mortgage data contains all required fields')
        } else {
          this.log('Mortgage Data Format', 'FAIL', `Missing fields: ${missingFields.join(', ')}`, mortgage)
        }

        // Check if amounts are numbers (not strings)
        if (typeof mortgage.original_principal === 'number' && typeof mortgage.scheduled_payment === 'number') {
          this.log('Mortgage Number Types', 'PASS', 'Mortgage amounts are proper numbers')
        } else {
          this.log('Mortgage Number Types', 'FAIL', 'Mortgage amounts are not numbers', {
            original_principal: typeof mortgage.original_principal,
            scheduled_payment: typeof mortgage.scheduled_payment
          })
        }
      }

      // POST new mortgage
      const newMortgage = {
        name: 'Test Mortgage',
        isPrimary: true,
        originalPrincipalCents: 30000000, // $300,000
        currentPrincipalCents: 29500000,  // $295,000
        interestRateApy: 6.5,
        termMonths: 360,
        startDate: '2025-01-01',
        scheduledPaymentCents: 200000,    // $2,000
        paymentDay: 1,
        escrowEnabled: true,
        escrowTaxesCents: 50000,          // $500
        escrowInsuranceCents: 15000,      // $150
        active: true,
        splitMode: 'shares',
        splits: this.testData.memberId ? [
          { memberId: this.testData.memberId, value: 1 }
        ] : []
      }

      const createdMortgage = await this.apiCall('POST', '/mortgages', newMortgage)

      if (createdMortgage.id && createdMortgage.name === newMortgage.name) {
        this.log('Mortgages POST', 'PASS', 'Mortgage created successfully')
        this.testData.mortgageId = createdMortgage.id

        // Verify field conversion (cents to dollars)
        if (createdMortgage.original_principal === 300000 && createdMortgage.scheduled_payment === 2000) {
          this.log('Mortgage Cents Conversion', 'PASS', 'Cents properly converted to dollars')
        } else {
          this.log('Mortgage Cents Conversion', 'FAIL', 'Cents conversion failed', {
            expected_original: 300000,
            actual_original: createdMortgage.original_principal,
            expected_payment: 2000,
            actual_payment: createdMortgage.scheduled_payment
          })
        }

        // Verify splits were created
        if (createdMortgage.splits && createdMortgage.splits.length > 0) {
          this.log('Mortgage Splits', 'PASS', 'Mortgage splits created correctly')
        } else {
          this.log('Mortgage Splits', 'FAIL', 'Mortgage splits not created', createdMortgage)
        }
      } else {
        this.log('Mortgages POST', 'FAIL', 'Created mortgage missing required fields', createdMortgage)
      }

      // PUT update mortgage
      if (this.testData.mortgageId) {
        const updatedMortgage = await this.apiCall('PUT', `/mortgages/${this.testData.mortgageId}`, {
          ...newMortgage,
          name: 'Updated Test Mortgage',
          currentPrincipalCents: 29000000 // $290,000
        })

        if (updatedMortgage.name === 'Updated Test Mortgage' && updatedMortgage.current_principal === 290000) {
          this.log('Mortgages PUT', 'PASS', 'Mortgage updated successfully')
        } else {
          this.log('Mortgages PUT', 'FAIL', 'Mortgage update failed', updatedMortgage)
        }
      }

    } catch (error) {
      this.log('Mortgages API', 'FAIL', `Mortgages API test failed: ${error.message}`, error)
    }
  }

  async testSettingsAPI() {
    console.log('\n⚙️ Testing Settings API')

    try {
      // GET all settings
      const settings = await this.apiCall('GET', '/settings')
      this.log('Settings GET', 'PASS', `Retrieved ${Object.keys(settings).length} settings`)

      // PUT update setting
      const updatedSettings = await this.apiCall('PUT', '/settings', {
        testKey: 'testValue',
        anotherKey: 'anotherValue'
      })

      if (updatedSettings.testKey === 'testValue') {
        this.log('Settings PUT', 'PASS', 'Settings updated successfully')
      } else {
        this.log('Settings PUT', 'FAIL', 'Settings update failed', updatedSettings)
      }

    } catch (error) {
      this.log('Settings API', 'FAIL', `Settings API test failed: ${error.message}`, error)
    }
  }

  async testDataConsistency() {
    console.log('\n🔍 Testing Data Consistency')

    try {
      // Test that all entities are still retrievable
      const [members, bills, payments, recurringBills, mortgages] = await Promise.all([
        this.apiCall('GET', '/members'),
        this.apiCall('GET', '/bills'),
        this.apiCall('GET', '/payments'),
        this.apiCall('GET', '/recurring-bills'),
        this.apiCall('GET', '/mortgages')
      ])

      this.log('Data Consistency', 'PASS', `All entities retrievable: ${members.length} members, ${bills.length} bills, ${payments.length} payments, ${recurringBills.length} recurring bills, ${mortgages.length} mortgages`)

      // Test relationships
      if (bills.length > 0 && payments.length > 0) {
        const billsWithPayments = bills.filter(bill =>
          payments.some(payment => payment.billId === bill.id)
        )

        if (billsWithPayments.length > 0) {
          this.log('Bill-Payment Relationships', 'PASS', 'Bill-payment relationships maintained')
        } else {
          this.log('Bill-Payment Relationships', 'FAIL', 'No bill-payment relationships found')
        }
      }

    } catch (error) {
      this.log('Data Consistency', 'FAIL', `Data consistency test failed: ${error.message}`, error)
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling')

    try {
      // Test 404 errors
      try {
        await this.apiCall('GET', '/members/nonexistent-id')
        this.log('404 Error Handling', 'FAIL', 'Should have returned 404 for nonexistent member')
      } catch (error) {
        if (error.message.includes('404')) {
          this.log('404 Error Handling', 'PASS', '404 error properly handled')
        } else {
          this.log('404 Error Handling', 'FAIL', `Unexpected error: ${error.message}`)
        }
      }

      // Test invalid data
      try {
        await this.apiCall('POST', '/bills', { invalidField: 'test' })
        this.log('Invalid Data Handling', 'FAIL', 'Should have rejected invalid bill data')
      } catch (error) {
        this.log('Invalid Data Handling', 'PASS', 'Invalid data properly rejected')
      }

    } catch (error) {
      this.log('Error Handling', 'FAIL', `Error handling test failed: ${error.message}`, error)
    }
  }

  async cleanupTestData() {
    console.log('\n🧹 Cleaning up test data')

    try {
      // Delete in reverse order of creation to respect foreign key constraints
      if (this.testData.paymentId) {
        await this.apiCall('DELETE', `/payments/${this.testData.paymentId}`)
        this.log('Cleanup Payment', 'PASS', 'Test payment deleted')
      }

      if (this.testData.billId) {
        await this.apiCall('DELETE', `/bills/${this.testData.billId}`)
        this.log('Cleanup Bill', 'PASS', 'Test bill deleted')
      }

      if (this.testData.recurringBillId) {
        await this.apiCall('DELETE', `/recurring-bills/${this.testData.recurringBillId}`)
        this.log('Cleanup Recurring Bill', 'PASS', 'Test recurring bill deleted')
      }

      if (this.testData.mortgageId) {
        await this.apiCall('DELETE', `/mortgages/${this.testData.mortgageId}`)
        this.log('Cleanup Mortgage', 'PASS', 'Test mortgage deleted')
      }

      if (this.testData.memberId) {
        await this.apiCall('DELETE', `/members/${this.testData.memberId}`)
        this.log('Cleanup Member', 'PASS', 'Test member deleted')
      }

    } catch (error) {
      this.log('Cleanup', 'FAIL', `Cleanup failed: ${error.message}`, error)
    }
  }

  printSummary() {
    console.log('\n📊 Test Summary')
    console.log('==============')

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

    console.log(`\n${failed === 0 ? '🎉 All tests passed!' : '⚠️ Some tests failed!'}`)
  }
}

// Run the test suite
async function main() {
  const tester = new DatabaseTester()

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

export { DatabaseTester }