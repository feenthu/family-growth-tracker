import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Clean up existing data
  await prisma.mortgagePaymentBreakdown.deleteMany()
  await prisma.mortgagePaymentAllocation.deleteMany()
  await prisma.mortgagePayment.deleteMany()
  await prisma.mortgageSplit.deleteMany()
  await prisma.mortgage.deleteMany()
  
  await prisma.paymentAllocation.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.billSplit.deleteMany()
  await prisma.bill.deleteMany()
  
  await prisma.recurringBillSplit.deleteMany()
  await prisma.recurringBill.deleteMany()
  
  await prisma.member.deleteMany()

  // Create demo family members
  const alex = await prisma.member.create({
    data: {
      id: 'alex',
      name: 'Alex',
      color: 'bg-blue-500',
    },
  })

  const beth = await prisma.member.create({
    data: {
      id: 'beth',
      name: 'Beth',
      color: 'bg-pink-500',
    },
  })

  // Create a demo recurring bill
  const recurringBill = await prisma.recurringBill.create({
    data: {
      name: 'Electricity',
      amountCents: 15000, // $150.00
      dayOfMonth: 15,
      frequency: 'monthly',
      lastGeneratedPeriod: '2024-08',
      splitMode: 'percent',
      splits: {
        create: [
          { memberId: alex.id, value: 60 }, // 60%
          { memberId: beth.id, value: 40 }, // 40%
        ],
      },
    },
  })

  // Create a demo bill instance
  const bill = await prisma.bill.create({
    data: {
      name: 'Electricity',
      amountCents: 15000,
      dueDate: new Date('2024-09-15'),
      recurringBillId: recurringBill.id,
      period: '2024-09',
      splitMode: 'percent',
      splits: {
        create: [
          { memberId: alex.id, value: 60 },
          { memberId: beth.id, value: 40 },
        ],
      },
    },
  })

  // Create a demo payment
  await prisma.payment.create({
    data: {
      billId: bill.id,
      paidDate: new Date('2024-09-10'),
      amountCents: 15000,
      method: 'ach',
      payerMemberId: alex.id,
      note: 'Monthly electricity bill',
      allocations: {
        create: [
          { memberId: alex.id, amountCents: 9000 }, // $90.00 (60%)
          { memberId: beth.id, amountCents: 6000 }, // $60.00 (40%)
        ],
      },
    },
  })

  // Create a demo mortgage
  const mortgage = await prisma.mortgage.create({
    data: {
      name: 'Primary Home',
      lender: 'First National Bank',
      isPrimary: true,
      originalPrincipalCents: 40000000, // $400,000
      currentPrincipalCents: 38500000,  // $385,000
      interestRateApy: 6.25,
      termMonths: 360, // 30 years
      startDate: new Date('2022-01-01'),
      scheduledPaymentCents: 246200, // $2,462.00
      paymentDay: 1,
      escrowEnabled: true,
      escrowTaxesCents: 45000,     // $450.00
      escrowInsuranceCents: 12500, // $125.00
      escrowMipCents: 0,
      escrowHoaCents: 8500,        // $85.00
      notes: '30-year fixed conventional loan',
      active: true,
      splitMode: 'percent',
      splits: {
        create: [
          { memberId: alex.id, value: 55 }, // 55%
          { memberId: beth.id, value: 45 }, // 45%
        ],
      },
    },
  })

  // Create a demo mortgage payment
  const mortgagePayment = await prisma.mortgagePayment.create({
    data: {
      mortgageId: mortgage.id,
      paidDate: new Date('2024-09-01'),
      amountCents: 246200,
      method: 'ach',
      payerMemberId: alex.id,
      note: 'September mortgage payment',
      allocations: {
        create: [
          { memberId: alex.id, amountCents: 135410 }, // 55%
          { memberId: beth.id, amountCents: 110790 }, // 45%
        ],
      },
    },
  })

  // Create the payment breakdown
  await prisma.mortgagePaymentBreakdown.create({
    data: {
      id: mortgagePayment.id,
      paymentId: mortgagePayment.id,
      mortgageId: mortgage.id,
      principalCents: 154500,  // $1,545.00
      interestCents: 200200,   // $2,002.00  
      escrowCents: 66000,      // $660.00 (taxes + insurance + HOA)
    },
  })

  console.log('Seed data created successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })