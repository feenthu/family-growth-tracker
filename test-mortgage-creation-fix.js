// Test script to verify the mortgage creation fix works
const API_URL = 'https://family-growth-tracker-production.up.railway.app';

async function testMortgageCreation() {
  // Test with the exact data the user provided
  const testMortgage = {
    name: "Test Mortgage Fix",
    lender: null,
    isPrimary: true,
    originalPrincipalCents: 500000 * 100, // $500,000
    currentPrincipalCents: 500000 * 100,
    interestRateApy: 6.275,
    termMonths: 360,
    startDate: "2025-10-01",
    scheduledPaymentCents: 4000 * 100, // $4,000
    paymentDay: 1,
    escrowEnabled: true,
    escrowTaxesCents: 700 * 100, // $700
    escrowInsuranceCents: 171 * 100, // $171
    escrowMipCents: undefined,
    escrowHoaCents: 0 * 100, // $0 (this was part of the issue)
    notes: null,
    active: true,
    splitMode: "shares",
    splits: [
      { memberId: "039dea27-7ad4-4e4e-964b-d3aa5b81bed1", value: 1 },
      { memberId: "7c02b6bf-69f9-4c1d-a893-ff0e6f423a0f", value: 1 },
      { memberId: "4e6fd0ac-defd-46eb-946c-ac43ab027024", value: 1 },
      { memberId: "bf0e5e57-ced6-4131-92f2-08c7a91e73c6", value: 1 }
    ]
  };

  try {
    console.log('Testing mortgage creation with user data...');

    const response = await fetch(`${API_URL}/api/mortgages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMortgage)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to create mortgage:', response.status, error);
      return;
    }

    const createdMortgage = await response.json();
    console.log('✅ Successfully created mortgage!');
    console.log('Response contains required fields:');
    console.log('- originalPrincipalCents:', createdMortgage.originalPrincipalCents);
    console.log('- currentPrincipalCents:', createdMortgage.currentPrincipalCents);
    console.log('- scheduledPaymentCents:', createdMortgage.scheduledPaymentCents);
    console.log('- escrowTaxesCents:', createdMortgage.escrowTaxesCents);
    console.log('- escrowInsuranceCents:', createdMortgage.escrowInsuranceCents);
    console.log('- escrowHoaCents:', createdMortgage.escrowHoaCents);

    // Verify amounts are correct
    const expectedPrincipal = 500000 * 100;
    const expectedPayment = 4000 * 100;
    const expectedTaxes = 700 * 100;
    const expectedInsurance = 171 * 100;
    const expectedHoa = 0;

    console.log('\n✅ Validation:');
    console.log('- Principal correct:', createdMortgage.originalPrincipalCents === expectedPrincipal);
    console.log('- Payment correct:', createdMortgage.scheduledPaymentCents === expectedPayment);
    console.log('- Taxes correct:', createdMortgage.escrowTaxesCents === expectedTaxes);
    console.log('- Insurance correct:', createdMortgage.escrowInsuranceCents === expectedInsurance);
    console.log('- HOA correct:', createdMortgage.escrowHoaCents === expectedHoa);

    // Clean up - delete the test mortgage
    console.log('\n🧹 Cleaning up test mortgage...');
    const deleteResponse = await fetch(`${API_URL}/api/mortgages/${createdMortgage.id}`, {
      method: 'DELETE'
    });

    if (deleteResponse.ok) {
      console.log('✅ Test mortgage cleaned up successfully');
    } else {
      console.log('⚠️  Failed to clean up test mortgage:', deleteResponse.status);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMortgageCreation();