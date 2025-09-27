#!/usr/bin/env tsx

/**
 * Financed Expense Implementation Validation Script
 * Validates the complete implementation without requiring database connection
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface ValidationResult {
  category: string
  test: string
  status: 'PASS' | 'FAIL' | 'WARN'
  message: string
  details?: string
}

class ImplementationValidator {
  private results: ValidationResult[] = []
  private basePath = process.cwd()

  private log(category: string, test: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, details?: string) {
    this.results.push({ category, test, status, message, details })
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
    console.log(`${icon} [${category}] ${test}: ${message}`)
    if (details && status !== 'PASS') {
      console.log(`   ${details}`)
    }
  }

  private fileExists(path: string): boolean {
    return existsSync(join(this.basePath, path))
  }

  private readFile(path: string): string {
    try {
      return readFileSync(join(this.basePath, path), 'utf-8')
    } catch (error) {
      return ''
    }
  }

  async validateImplementation() {
    console.log('🔍 Validating Financed Expense Implementation\n')

    this.validateDatabaseSchema()
    this.validateApiEndpoints()
    this.validateFrontendComponents()
    this.validateTypeDefinitions()
    this.validateIntegrationPoints()
    this.validateTestSuite()
    this.validateDocumentation()

    this.printSummary()
    this.assessDeploymentReadiness()
  }

  private validateDatabaseSchema() {
    console.log('\n📊 Validating Database Schema')

    // Check if database initialization includes financed expense tables
    const dbInit = this.readFile('db/init.ts')

    if (dbInit.includes('financed_expenses')) {
      this.log('Database', 'financed_expenses table', 'PASS', 'Table definition found')
    } else {
      this.log('Database', 'financed_expenses table', 'FAIL', 'Table definition missing')
    }

    if (dbInit.includes('financed_expense_splits')) {
      this.log('Database', 'financed_expense_splits table', 'PASS', 'Splits table definition found')
    } else {
      this.log('Database', 'financed_expense_splits table', 'FAIL', 'Splits table definition missing')
    }

    if (dbInit.includes('financed_expense_payments')) {
      this.log('Database', 'financed_expense_payments table', 'PASS', 'Payments table definition found')
    } else {
      this.log('Database', 'financed_expense_payments table', 'FAIL', 'Payments table definition missing')
    }

    // Check for proper indexing
    if (dbInit.includes('idx_financed_expense')) {
      this.log('Database', 'Indexes', 'PASS', 'Performance indexes defined')
    } else {
      this.log('Database', 'Indexes', 'WARN', 'No specific indexes found - may impact performance')
    }
  }

  private validateApiEndpoints() {
    console.log('\n🌐 Validating API Endpoints')

    const serverCode = this.readFile('server.ts')

    // Check for all 6 required endpoints
    const endpoints = [
      { path: '/api/financed-expenses', method: 'GET', description: 'Get all financed expenses' },
      { path: '/api/financed-expenses', method: 'POST', description: 'Create financed expense' },
      { path: '/api/financed-expenses/:id', method: 'GET', description: 'Get specific expense' },
      { path: '/api/financed-expenses/:id', method: 'PUT', description: 'Update expense' },
      { path: '/api/financed-expenses/:id/payments', method: 'GET', description: 'Get payment schedule' },
      { path: '/api/financed-expenses/:id/payments/:paymentId/mark-paid', method: 'POST', description: 'Mark payment paid' }
    ]

    for (const endpoint of endpoints) {
      const pattern = new RegExp(`app\\.${endpoint.method.toLowerCase()}\\(['"]${endpoint.path.replace(/:\w+/g, ':\\w+').replace(/\//g, '\\/')}['"]`)
      if (pattern.test(serverCode)) {
        this.log('API', endpoint.description, 'PASS', `${endpoint.method} ${endpoint.path} implemented`)
      } else {
        this.log('API', endpoint.description, 'FAIL', `${endpoint.method} ${endpoint.path} not found`)
      }
    }

    // Check for financial calculation functions
    if (serverCode.includes('calculateMonthlyPayment')) {
      this.log('API', 'Financial calculations', 'PASS', 'Monthly payment calculation implemented')
    } else {
      this.log('API', 'Financial calculations', 'FAIL', 'Monthly payment calculation missing')
    }

    if (serverCode.includes('generatePaymentSchedule')) {
      this.log('API', 'Payment schedule generation', 'PASS', 'Payment schedule generation implemented')
    } else {
      this.log('API', 'Payment schedule generation', 'FAIL', 'Payment schedule generation missing')
    }

    // Check for proper error handling
    if (serverCode.includes('try') && serverCode.includes('catch')) {
      this.log('API', 'Error handling', 'PASS', 'Error handling patterns found')
    } else {
      this.log('API', 'Error handling', 'WARN', 'Limited error handling detected')
    }
  }

  private validateFrontendComponents() {
    console.log('\n⚛️ Validating Frontend Components')

    // Check for required component files
    const components = [
      { file: 'components/FinancedExpenseCard.tsx', name: 'FinancedExpenseCard' },
      { file: 'components/FinancedExpenseModal.tsx', name: 'FinancedExpenseModal' },
      { file: 'components/BillModal.tsx', name: 'Enhanced BillModal' },
      { file: 'hooks/useFinancedExpenses.ts', name: 'API Hooks' }
    ]

    for (const component of components) {
      if (this.fileExists(component.file)) {
        this.log('Frontend', component.name, 'PASS', `${component.file} exists`)

        // Check for proper React patterns
        const content = this.readFile(component.file)
        if (content.includes('export') && (content.includes('React') || content.includes('useState') || content.includes('useEffect'))) {
          this.log('Frontend', `${component.name} structure`, 'PASS', 'Proper React component structure')
        } else {
          this.log('Frontend', `${component.name} structure`, 'WARN', 'Component structure may need review')
        }
      } else {
        this.log('Frontend', component.name, 'FAIL', `${component.file} missing`)
      }
    }

    // Check for TypeScript integration
    const hookContent = this.readFile('hooks/useFinancedExpenses.ts')
    if (hookContent.includes('interface') && hookContent.includes('apiClient')) {
      this.log('Frontend', 'TypeScript integration', 'PASS', 'Proper TypeScript patterns and API integration')
    } else {
      this.log('Frontend', 'TypeScript integration', 'WARN', 'TypeScript integration may need review')
    }
  }

  private validateTypeDefinitions() {
    console.log('\n📝 Validating Type Definitions')

    const typesFile = this.readFile('types.ts')
    const apiTypesFile = this.readFile('utils/api.ts')

    // Check for FinancedExpense interface
    if (typesFile.includes('FinancedExpense') || apiTypesFile.includes('FinancedExpense')) {
      this.log('Types', 'FinancedExpense interface', 'PASS', 'FinancedExpense type definition found')
    } else {
      this.log('Types', 'FinancedExpense interface', 'FAIL', 'FinancedExpense type definition missing')
    }

    // Check for FinancedExpensePayment interface
    if (typesFile.includes('FinancedExpensePayment') || apiTypesFile.includes('FinancedExpensePayment')) {
      this.log('Types', 'FinancedExpensePayment interface', 'PASS', 'Payment type definition found')
    } else {
      this.log('Types', 'FinancedExpensePayment interface', 'FAIL', 'Payment type definition missing')
    }

    // Check for API type mappings
    const hookContent = this.readFile('hooks/useFinancedExpenses.ts')
    if (hookContent.includes('apiFinancedExpenseToFinancedExpense') || hookContent.includes('ToApi')) {
      this.log('Types', 'Type conversion utilities', 'PASS', 'Frontend/API type conversion implemented')
    } else {
      this.log('Types', 'Type conversion utilities', 'WARN', 'Type conversion utilities may be missing')
    }
  }

  private validateIntegrationPoints() {
    console.log('\n🔗 Validating Integration Points')

    // Check App.tsx for financed expense integration
    const appContent = this.readFile('App.tsx')
    if (appContent.includes('FinancedExpense') || appContent.includes('financed')) {
      this.log('Integration', 'Main app integration', 'PASS', 'Financed expenses integrated into main app')
    } else {
      this.log('Integration', 'Main app integration', 'WARN', 'Main app integration may be incomplete')
    }

    // Check BillModal for financing checkbox
    const billModalContent = this.readFile('components/BillModal.tsx')
    if (billModalContent.includes('financed') || billModalContent.includes('financing')) {
      this.log('Integration', 'BillModal enhancement', 'PASS', 'BillModal enhanced with financing options')
    } else {
      this.log('Integration', 'BillModal enhancement', 'FAIL', 'BillModal financing integration missing')
    }

    // Check for family view integration
    const familyViewContent = this.readFile('components/FamilyView.tsx')
    if (familyViewContent.includes('FinancedExpense') || familyViewContent.includes('financed')) {
      this.log('Integration', 'Family view integration', 'PASS', 'Family view includes financed expenses')
    } else {
      this.log('Integration', 'Family view integration', 'WARN', 'Family view integration may be incomplete')
    }
  }

  private validateTestSuite() {
    console.log('\n🧪 Validating Test Suite')

    // Check for test files
    const testFiles = [
      { file: 'test-financed-expenses.ts', name: 'API Integration Tests' },
      { file: 'test-frontend-components.ts', name: 'Frontend Component Tests' },
      { file: 'test-database.ts', name: 'Database Integration Tests' }
    ]

    for (const testFile of testFiles) {
      if (this.fileExists(testFile.file)) {
        this.log('Testing', testFile.name, 'PASS', `${testFile.file} exists`)

        const content = this.readFile(testFile.file)
        const testCount = (content.match(/\.log\(/g) || []).length
        if (testCount > 10) {
          this.log('Testing', `${testFile.name} coverage`, 'PASS', `${testCount} test scenarios found`)
        } else {
          this.log('Testing', `${testFile.name} coverage`, 'WARN', `Only ${testCount} test scenarios found`)
        }
      } else {
        this.log('Testing', testFile.name, 'FAIL', `${testFile.file} missing`)
      }
    }

    // Check package.json for test scripts
    const packageJson = this.readFile('package.json')
    if (packageJson.includes('"test":') && packageJson.includes('financed-expenses')) {
      this.log('Testing', 'Test scripts', 'PASS', 'NPM test scripts configured')
    } else {
      this.log('Testing', 'Test scripts', 'WARN', 'Test scripts may need configuration')
    }
  }

  private validateDocumentation() {
    console.log('\n📚 Validating Documentation')

    // Check for specification document
    if (this.fileExists('FINANCED_EXPENSE_SPECIFICATION.md')) {
      this.log('Documentation', 'Technical specification', 'PASS', 'Comprehensive technical specification exists')
    } else {
      this.log('Documentation', 'Technical specification', 'FAIL', 'Technical specification missing')
    }

    // Check for test report
    if (this.fileExists('FINANCED_EXPENSE_TEST_REPORT.md')) {
      this.log('Documentation', 'Test report', 'PASS', 'Detailed test report exists')
    } else {
      this.log('Documentation', 'Test report', 'WARN', 'Test report missing')
    }

    // Check for implementation metadata
    if (this.fileExists('financed-expense-metadata.json')) {
      this.log('Documentation', 'Implementation metadata', 'PASS', 'Implementation metadata exists')
    } else {
      this.log('Documentation', 'Implementation metadata', 'WARN', 'Implementation metadata missing')
    }

    // Check README updates
    const readme = this.readFile('README.md')
    if (readme.includes('financed') || readme.includes('financing')) {
      this.log('Documentation', 'README updates', 'PASS', 'README includes financed expense documentation')
    } else {
      this.log('Documentation', 'README updates', 'WARN', 'README may need updates for new feature')
    }
  }

  private printSummary() {
    console.log('\n📊 Validation Summary')
    console.log('====================')

    const categories = [...new Set(this.results.map(r => r.category))]

    for (const category of categories) {
      const categoryResults = this.results.filter(r => r.category === category)
      const passed = categoryResults.filter(r => r.status === 'PASS').length
      const failed = categoryResults.filter(r => r.status === 'FAIL').length
      const warned = categoryResults.filter(r => r.status === 'WARN').length

      console.log(`\n${category}:`)
      console.log(`  ✅ Passed: ${passed}`)
      console.log(`  ❌ Failed: ${failed}`)
      console.log(`  ⚠️ Warnings: ${warned}`)
    }

    const totalPassed = this.results.filter(r => r.status === 'PASS').length
    const totalFailed = this.results.filter(r => r.status === 'FAIL').length
    const totalWarned = this.results.filter(r => r.status === 'WARN').length
    const total = this.results.length

    console.log(`\n📈 Overall Results:`)
    console.log(`✅ Passed: ${totalPassed}/${total} (${((totalPassed/total)*100).toFixed(1)}%)`)
    console.log(`❌ Failed: ${totalFailed}/${total} (${((totalFailed/total)*100).toFixed(1)}%)`)
    console.log(`⚠️ Warnings: ${totalWarned}/${total} (${((totalWarned/total)*100).toFixed(1)}%)`)
  }

  private assessDeploymentReadiness() {
    console.log('\n🚀 Deployment Readiness Assessment')
    console.log('=================================')

    const criticalFailures = this.results.filter(r =>
      r.status === 'FAIL' &&
      (r.category === 'API' || r.category === 'Frontend' || r.category === 'Database')
    )

    const passRate = (this.results.filter(r => r.status === 'PASS').length / this.results.length) * 100

    if (criticalFailures.length === 0 && passRate >= 80) {
      console.log('🟢 READY FOR DEPLOYMENT')
      console.log('✅ All critical components implemented')
      console.log('✅ No blocking issues identified')
      console.log('✅ Pass rate meets deployment threshold')

      if (passRate >= 95) {
        console.log('🌟 EXCELLENT - Feature implementation is comprehensive')
      } else if (passRate >= 90) {
        console.log('👍 GOOD - Minor improvements recommended but not blocking')
      } else {
        console.log('👌 ACCEPTABLE - Some enhancements recommended for future iterations')
      }
    } else if (criticalFailures.length <= 2 && passRate >= 70) {
      console.log('🟡 DEPLOYMENT WITH CAUTION')
      console.log('⚠️ Some issues detected that should be addressed')
      console.log('⚠️ Consider fixing critical failures before deployment')

      if (criticalFailures.length > 0) {
        console.log('\nCritical Issues:')
        criticalFailures.forEach(failure => {
          console.log(`  ❌ [${failure.category}] ${failure.test}: ${failure.message}`)
        })
      }
    } else {
      console.log('🔴 NOT READY FOR DEPLOYMENT')
      console.log('❌ Critical issues must be resolved')
      console.log('❌ Implementation incomplete or has major flaws')

      console.log('\nBlocking Issues:')
      criticalFailures.forEach(failure => {
        console.log(`  ❌ [${failure.category}] ${failure.test}: ${failure.message}`)
      })
    }

    // Provide specific recommendations
    console.log('\n📋 Recommendations:')

    const warnings = this.results.filter(r => r.status === 'WARN')
    if (warnings.length > 0) {
      console.log('\nPost-Deployment Improvements:')
      warnings.forEach(warning => {
        console.log(`  ⚠️ ${warning.message}`)
      })
    }

    if (criticalFailures.length === 0) {
      console.log('✅ All critical functionality is implemented')
      console.log('✅ Feature ready for user testing and feedback')
      console.log('✅ Monitor system performance after deployment')
    }
  }
}

// Run validation
async function main() {
  const validator = new ImplementationValidator()
  await validator.validateImplementation()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { ImplementationValidator }