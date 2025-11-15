/**
 * Edge Case Testing Script for Balance Calculator
 * Tests complex scenarios and edge cases
 */

const { calculateBalances, generateSettlements } = require('./src/utils/balanceCalculator');

console.log('🧪 Running Edge Case Tests...\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    failCount++;
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`);
  }
}

// Test 1: Complex scenario from user requirement
test('Complex multi-payer with custom shares (A:50, B:80, C:80, D:110, paid A:200, B:120)', () => {
  const members = [
    { _id: 'A', name: 'A' },
    { _id: 'B', name: 'B' },
    { _id: 'C', name: 'C' },
    { _id: 'D', name: 'D' },
  ];

  const expenses = [{
    amount: 320,
    payers: [
      { member: { _id: 'A' }, amount: 200 },
      { member: { _id: 'B' }, amount: 120 },
    ],
    customShares: [
      { member: { _id: 'A' }, amount: 50 },
      { member: { _id: 'B' }, amount: 80 },
      { member: { _id: 'C' }, amount: 80 },
      { member: { _id: 'D' }, amount: 110 },
    ],
  }];

  const balances = calculateBalances(members, expenses);

  assertEquals(balances.find(b => b.memberId === 'A').balance, 150, 'A balance');
  assertEquals(balances.find(b => b.memberId === 'B').balance, 40, 'B balance');
  assertEquals(balances.find(b => b.memberId === 'C').balance, -80, 'C balance');
  assertEquals(balances.find(b => b.memberId === 'D').balance, -110, 'D balance');

  // Verify settlements
  const settlements = generateSettlements(balances);
  const totalSettlement = settlements.reduce((sum, s) => sum + s.amount, 0);
  assertEquals(totalSettlement, 190, 'Total settlement amount');
});

// Test 2: Rounding edge case
test('Rounding edge case with 3-way split', () => {
  const members = [
    { _id: '1', name: 'A' },
    { _id: '2', name: 'B' },
    { _id: '3', name: 'C' },
  ];

  const expenses = [{
    amount: 100,
    paidBy: { _id: '1' },
    sharedBy: [{ _id: '1' }, { _id: '2' }, { _id: '3' }],
  }];

  const balances = calculateBalances(members, expenses);

  // 100/3 = 33.33... per person
  const aBalance = balances.find(b => b.memberId === '1').balance;
  const bBalance = balances.find(b => b.memberId === '2').balance;
  const cBalance = balances.find(b => b.memberId === '3').balance;

  // Should sum to approximately 0 (within rounding tolerance of 0.01)
  const total = Math.round((aBalance + bBalance + cBalance) * 100) / 100;
  if (Math.abs(total) > 0.01) {
    throw new Error(`Total should be balanced within 0.01: got ${total}`);
  }
});

// Test 3: Single member expense (edge case)
test('Single member expense (all paid and owed by same person)', () => {
  const members = [{ _id: '1', name: 'Solo' }];

  const expenses = [{
    amount: 500,
    paidBy: { _id: '1' },
    sharedBy: [{ _id: '1' }],
  }];

  const balances = calculateBalances(members, expenses);
  assertEquals(balances[0].balance, 0, 'Balance should be 0');

  const settlements = generateSettlements(balances);
  assertEquals(settlements.length, 0, 'No settlements needed');
});

// Test 4: Multiple expenses with mixed payer modes
test('Multiple expenses with mixed single and multi-payer', () => {
  const members = [
    { _id: '1', name: 'A' },
    { _id: '2', name: 'B' },
  ];

  const expenses = [
    {
      amount: 100,
      paidBy: { _id: '1' },
      sharedBy: [{ _id: '1' }, { _id: '2' }],
    },
    {
      amount: 200,
      payers: [
        { member: { _id: '1' }, amount: 100 },
        { member: { _id: '2' }, amount: 100 },
      ],
      sharedBy: [{ _id: '1' }, { _id: '2' }],
    },
  ];

  const balances = calculateBalances(members, expenses);

  const aBalance = balances.find(b => b.memberId === '1').balance;
  const bBalance = balances.find(b => b.memberId === '2').balance;

  // A: paid 100+100=200, owes 50+100=150, balance = +50
  // B: paid 0+100=100, owes 50+100=150, balance = -50
  assertEquals(aBalance, 50, 'A balance');
  assertEquals(bBalance, -50, 'B balance');
});

// Test 5: All custom shares (no equal split)
test('All expenses use custom shares', () => {
  const members = [
    { _id: '1', name: 'A' },
    { _id: '2', name: 'B' },
  ];

  const expenses = [
    {
      amount: 100,
      paidBy: { _id: '1' },
      customShares: [
        { member: { _id: '1' }, amount: 30 },
        { member: { _id: '2' }, amount: 70 },
      ],
    },
    {
      amount: 200,
      paidBy: { _id: '2' },
      customShares: [
        { member: { _id: '1' }, amount: 120 },
        { member: { _id: '2' }, amount: 80 },
      ],
    },
  ];

  const balances = calculateBalances(members, expenses);

  // A: paid 100, owes 30+120=150, balance = -50
  // B: paid 200, owes 70+80=150, balance = +50
  const aBalance = balances.find(b => b.memberId === '1').balance;
  const bBalance = balances.find(b => b.memberId === '2').balance;

  assertEquals(aBalance, -50, 'A balance');
  assertEquals(bBalance, 50, 'B balance');
});

// Test 6: Partial members sharing (not all members in sharedBy)
test('Partial members sharing expense', () => {
  const members = [
    { _id: '1', name: 'A' },
    { _id: '2', name: 'B' },
    { _id: '3', name: 'C' },
  ];

  const expenses = [{
    amount: 100,
    paidBy: { _id: '1' },
    sharedBy: [{ _id: '1' }, { _id: '2' }], // C doesn't share
  }];

  const balances = calculateBalances(members, expenses);

  const cBalance = balances.find(b => b.memberId === '3').balance;
  assertEquals(cBalance, 0, 'C should have 0 balance (not sharing)');
});

// Test 7: Settled expenses should be ignored
test('Settled expenses are excluded from balance calculation', () => {
  const members = [
    { _id: '1', name: 'A' },
    { _id: '2', name: 'B' },
  ];

  const expenses = [
    {
      amount: 100,
      paidBy: { _id: '1' },
      sharedBy: [{ _id: '1' }, { _id: '2' }],
      settled: true, // This should be ignored
    },
    {
      amount: 200,
      paidBy: { _id: '2' },
      sharedBy: [{ _id: '1' }, { _id: '2' }],
      settled: false,
    },
  ];

  const balances = calculateBalances(members, expenses);

  // Only the second expense should count
  const aBalance = balances.find(b => b.memberId === '1').balance;
  const bBalance = balances.find(b => b.memberId === '2').balance;

  assertEquals(aBalance, -100, 'A balance');
  assertEquals(bBalance, 100, 'B balance');
});

// Test 8: Large number of members
test('Large number of members (10+)', () => {
  const members = [];
  for (let i = 1; i <= 15; i++) {
    members.push({ _id: `${i}`, name: `Member${i}` });
  }

  const expenses = [{
    amount: 1500,
    paidBy: { _id: '1' },
    sharedBy: members.map(m => ({ _id: m._id })),
  }];

  const balances = calculateBalances(members, expenses);

  // Each person owes 1500/15 = 100
  // Person 1 paid 1500, owes 100, balance = +1400
  const balance1 = balances.find(b => b.memberId === '1').balance;
  assertEquals(balance1, 1400, 'Payer balance');

  // All others owe 100
  const balance2 = balances.find(b => b.memberId === '2').balance;
  assertEquals(balance2, -100, 'Other member balance');
});

// Test 9: Very small amounts (precision test)
test('Very small amounts (0.01)', () => {
  const members = [
    { _id: '1', name: 'A' },
    { _id: '2', name: 'B' },
  ];

  const expenses = [{
    amount: 0.01,
    paidBy: { _id: '1' },
    sharedBy: [{ _id: '1' }, { _id: '2' }],
  }];

  const balances = calculateBalances(members, expenses);

  // 0.01/2 = 0.005, should round properly (within 0.01 tolerance)
  const total = Math.abs(balances.reduce((sum, b) => sum + b.balance, 0));
  if (total > 0.01) {
    throw new Error(`Total should be balanced within 0.01: got ${total}`);
  }
});

// Test 10: Completed settlements adjustment
test('Completed settlements adjust balances', () => {
  const members = [
    { _id: '1', name: 'A' },
    { _id: '2', name: 'B' },
  ];

  const expenses = [{
    amount: 100,
    paidBy: { _id: '1' },
    sharedBy: [{ _id: '1' }, { _id: '2' }],
  }];

  const completedSettlements = [{
    from: { _id: '2' },
    to: { _id: '1' },
    amount: 30,
  }];

  const balances = calculateBalances(members, expenses, completedSettlements);

  // Without settlement: A=+50, B=-50
  // With 30 settlement: A=+50-30=+20, B=-50+30=-20
  const aBalance = balances.find(b => b.memberId === '1').balance;
  const bBalance = balances.find(b => b.memberId === '2').balance;

  assertEquals(aBalance, 20, 'A balance after settlement');
  assertEquals(bBalance, -20, 'B balance after settlement');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📊 Total: ${passCount + failCount}`);
console.log(`🎯 Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
console.log('='.repeat(50));

if (failCount === 0) {
  console.log('\n🎉 All edge case tests passed! System is production ready.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review and fix.');
  process.exit(1);
}
