/**
 * Edge Cases and Complex Scenarios Test Suite
 * Tests extreme scenarios, precision issues, and complex money management
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../../server');
const Member = require('../models/Member');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { calculateBalances, generateSettlements } = require('../utils/balanceCalculator');

describe('Edge Cases and Complex Scenarios', () => {
  let authToken;

  beforeAll(async () => {
    // Login to get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ sharedKey: process.env.SHARED_KEY || 'your-secret-key-here' });
    authToken = loginResponse.body.token;
  });

  beforeEach(async () => {
    await Member.deleteMany({});
    await Expense.deleteMany({});
    await Settlement.deleteMany({});
  });

  describe('Large Numbers and Precision', () => {
    it('should handle very large expense amounts correctly', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' }
      ]);

      const largeAmount = 9999999.99; // $9,999,999.99
      const expense = await Expense.create({
        title: 'Large Purchase',
        amount: largeAmount,
        paidBy: members[0]._id,
        sharedBy: members.map(m => m._id),
        date: new Date(),
        memberCountAtTime: 2
      });

      const balances = calculateBalances(members, [expense], []);

      expect(balances[0].balance).toBe(largeAmount / 2); // 4999999.995 rounds to 5000000.00
      expect(balances[1].balance).toBe(-largeAmount / 2);

      // Verify precision is maintained to 2 decimal places
      expect(Number(balances[0].balance.toFixed(2))).toBe(5000000.00);
      expect(Number(balances[1].balance.toFixed(2))).toBe(-5000000.00);
    });

    it('should handle very small expense amounts', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' }
      ]);

      const smallAmount = 0.01; // 1 cent
      const expense = await Expense.create({
        title: 'Small Purchase',
        amount: smallAmount,
        paidBy: members[0]._id,
        sharedBy: members.map(m => m._id),
        date: new Date(),
        memberCountAtTime: 2
      });

      const balances = calculateBalances(members, [expense], []);

      // 0.01 / 2 = 0.005, rounds to 0.01 and 0.00
      expect(balances[0].balance).toBe(0.01);
      expect(balances[1].balance).toBe(-0.01);
    });

    it('should handle floating point precision with multiple operations', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ]);

      // Create expenses that might cause floating point issues
      const expenses = await Expense.create([
        {
          title: 'Expense 1',
          amount: 10.33,
          paidBy: members[0]._id,
          sharedBy: members.map(m => m._id),
          date: new Date(),
          memberCountAtTime: 3
        },
        {
          title: 'Expense 2',
          amount: 7.77,
          paidBy: members[1]._id,
          sharedBy: members.map(m => m._id),
          date: new Date(),
          memberCountAtTime: 3
        },
        {
          title: 'Expense 3',
          amount: 15.45,
          paidBy: members[2]._id,
          sharedBy: members.map(m => m._id),
          date: new Date(),
          memberCountAtTime: 3
        }
      ]);

      const balances = calculateBalances(members, expenses, []);

      // Verify total balance is 0 (conservation of money)
      const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
      expect(Math.abs(totalBalance)).toBeLessThan(0.01); // Allow tiny rounding error

      // Verify each balance is reasonable
      balances.forEach(balance => {
        expect(Math.abs(balance.balance)).toBeLessThan(50);
      });
    });

    it('should reject amounts with more than 2 decimal places', async () => {
      const member = await Member.create({ name: 'Alice' });

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Invalid Precision',
          amount: 10.999, // 3 decimal places
          paidBy: member._id,
          sharedBy: [member._id],
          date: new Date().toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('decimal');
    });
  });

  describe('Many Members Scenarios', () => {
    it('should handle expense split among 20 members', async () => {
      const memberNames = Array.from({ length: 20 }, (_, i) => `Member${i + 1}`);
      const members = await Member.create(memberNames.map(name => ({ name })));

      const expense = await Expense.create({
        title: 'Large Group Dinner',
        amount: 1000,
        paidBy: members[0]._id,
        sharedBy: members.map(m => m._id),
        date: new Date(),
        memberCountAtTime: 20
      });

      const balances = calculateBalances(members, [expense], []);

      // First member paid 1000, owes 50 = balance of 950
      expect(balances[0].balance).toBe(950);

      // Other 19 members each owe 50
      for (let i = 1; i < 20; i++) {
        expect(balances[i].balance).toBe(-50);
      }

      // Generate settlements
      const settlements = generateSettlements(balances);

      // Should have 19 settlements (19 people pay the first person)
      expect(settlements.length).toBe(19);
      expect(settlements.every(s => s.to === 'Member1')).toBe(true);
      expect(settlements.every(s => s.amount === 50)).toBe(true);
    });

    it('should handle complex multi-payer scenario with many members', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' },
        { name: 'Diana' },
        { name: 'Eve' },
        { name: 'Frank' }
      ]);

      // Multiple people paid for the same expense
      const expense = await Expense.create({
        title: 'Group Trip',
        amount: 600,
        payers: [
          { member: members[0]._id, amount: 200 },
          { member: members[1]._id, amount: 250 },
          { member: members[2]._id, amount: 150 }
        ],
        sharedBy: members.map(m => m._id),
        date: new Date(),
        memberCountAtTime: 6
      });

      const balances = calculateBalances(members, [expense], []);

      // Each person should owe 100 (600 / 6)
      // Alice paid 200, owes 100 = +100 balance
      // Bob paid 250, owes 100 = +150 balance
      // Charlie paid 150, owes 100 = +50 balance
      // Diana, Eve, Frank paid 0, owe 100 = -100 balance each

      expect(balances[0].balance).toBe(100);
      expect(balances[1].balance).toBe(150);
      expect(balances[2].balance).toBe(50);
      expect(balances[3].balance).toBe(-100);
      expect(balances[4].balance).toBe(-100);
      expect(balances[5].balance).toBe(-100);
    });
  });

  describe('Custom Shares Edge Cases', () => {
    it('should handle custom shares that dont divide evenly', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ]);

      // Total is 100, but shares are 33.33 each which doesn't add up perfectly
      const expense = await Expense.create({
        title: 'Uneven Split',
        amount: 100,
        paidBy: members[0]._id,
        customShares: [
          { member: members[0]._id, amount: 33.33 },
          { member: members[1]._id, amount: 33.33 },
          { member: members[2]._id, amount: 33.34 }
        ],
        sharedBy: members.map(m => m._id),
        date: new Date(),
        memberCountAtTime: 3
      });

      const balances = calculateBalances(members, [expense], []);

      // Alice paid 100, owes 33.33 = +66.67
      expect(balances[0].balance).toBe(66.67);
      expect(balances[1].balance).toBe(-33.33);
      expect(balances[2].balance).toBe(-33.34);
    });

    it('should handle custom shares with zero amounts', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ]);

      // Bob doesn't participate in this expense
      const expense = await Expense.create({
        title: 'Partial Participation',
        amount: 100,
        paidBy: members[0]._id,
        customShares: [
          { member: members[0]._id, amount: 50 },
          { member: members[1]._id, amount: 0 },
          { member: members[2]._id, amount: 50 }
        ],
        sharedBy: [members[0]._id, members[2]._id],
        date: new Date(),
        memberCountAtTime: 3
      });

      const balances = calculateBalances(members, [expense], []);

      expect(balances[0].balance).toBe(50);  // Paid 100, owes 50
      expect(balances[1].balance).toBe(0);   // Not participating
      expect(balances[2].balance).toBe(-50); // Owes 50
    });

    it('should reject custom shares that exceed expense amount', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' }
      ]);

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Invalid Custom Shares',
          amount: 100,
          paidBy: members[0]._id.toString(),
          customShares: [
            { member: members[0]._id.toString(), amount: 60 },
            { member: members[1]._id.toString(), amount: 50 } // Total = 110, exceeds 100
          ],
          sharedBy: members.map(m => m._id.toString()),
          date: new Date().toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('custom shares');
    });
  });

  describe('Settlement Complexity', () => {
    it('should handle multiple overlapping settlements correctly', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ]);

      // Create expenses
      const expenses = await Expense.create([
        {
          title: 'Expense 1',
          amount: 300,
          paidBy: members[0]._id,
          sharedBy: members.map(m => m._id),
          date: new Date(),
          memberCountAtTime: 3
        },
        {
          title: 'Expense 2',
          amount: 150,
          paidBy: members[1]._id,
          sharedBy: members.map(m => m._id),
          date: new Date(),
          memberCountAtTime: 3
        }
      ]);

      // Record a partial settlement
      const settlement = await Settlement.create({
        from: members[1]._id,
        to: members[0]._id,
        amount: 50,
        paidDate: new Date()
      });

      const balances = calculateBalances(members, expenses, [settlement]);

      // Alice: paid 300, owes 150 = +150
      // Bob: paid 150, owes 150 = 0, but paid 50 to Alice = -50
      // Charlie: paid 0, owes 150 = -150
      // After settlement: Alice gets +50, Bob gives -50

      const aliceBalance = balances.find(b => b.memberName === 'Alice').balance;
      const bobBalance = balances.find(b => b.memberName === 'Bob').balance;
      const charlieBalance = balances.find(b => b.memberName === 'Charlie').balance;

      expect(aliceBalance).toBe(100); // 150 - 50 received
      expect(bobBalance).toBe(-50);    // 0 + 50 paid
      expect(charlieBalance).toBe(-150);
    });

    it('should handle circular settlements', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ]);

      // Alice owes Bob, Bob owes Charlie, Charlie owes Alice
      const settlements = await Settlement.create([
        { from: members[0]._id, to: members[1]._id, amount: 50 },
        { from: members[1]._id, to: members[2]._id, amount: 50 },
        { from: members[2]._id, to: members[0]._id, amount: 50 }
      ]);

      const balances = calculateBalances(members, [], settlements);

      // Net effect should be zero for everyone
      expect(balances[0].balance).toBe(0);
      expect(balances[1].balance).toBe(0);
      expect(balances[2].balance).toBe(0);
    });

    it('should minimize settlement transactions optimally', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' },
        { name: 'Diana' }
      ]);

      // Create a scenario where Alice and Bob owe money, Charlie and Diana are owed
      const balances = [
        { memberId: members[0]._id, memberName: 'Alice', balance: -100 },
        { memberId: members[1]._id, memberName: 'Bob', balance: -50 },
        { memberId: members[2]._id, memberName: 'Charlie', balance: 75 },
        { memberId: members[3]._id, memberName: 'Diana', balance: 75 }
      ];

      const settlements = generateSettlements(balances);

      // Optimal: 3 transactions instead of 6
      expect(settlements.length).toBe(3);

      // Verify total amounts match
      const totalPaid = settlements.reduce((sum, s) => sum + s.amount, 0);
      expect(totalPaid).toBe(150);
    });
  });

  describe('Date Range and Filtering', () => {
    it('should handle expenses spanning multiple years', async () => {
      const member = await Member.create({ name: 'Alice' });

      const expenses = await Expense.create([
        {
          title: '2020 Expense',
          amount: 100,
          paidBy: member._id,
          sharedBy: [member._id],
          date: new Date('2020-01-01'),
          memberCountAtTime: 1
        },
        {
          title: '2023 Expense',
          amount: 200,
          paidBy: member._id,
          sharedBy: [member._id],
          date: new Date('2023-06-15'),
          memberCountAtTime: 1
        },
        {
          title: '2024 Expense',
          amount: 300,
          paidBy: member._id,
          sharedBy: [member._id],
          date: new Date('2024-12-31'),
          memberCountAtTime: 1
        }
      ]);

      // Filter by date range
      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2023-01-01',
          endDate: '2023-12-31'
        });

      expect(response.status).toBe(200);
      expect(response.body.expenses.length).toBe(1);
      expect(response.body.expenses[0].title).toBe('2023 Expense');
    });

    it('should handle future dated expenses', async () => {
      const member = await Member.create({ name: 'Alice' });

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const expense = await Expense.create({
        title: 'Future Expense',
        amount: 100,
        paidBy: member._id,
        sharedBy: [member._id],
        date: futureDate,
        memberCountAtTime: 1
      });

      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses.some(e => e.title === 'Future Expense')).toBe(true);
    });
  });

  describe('API Rate Limiting and Security', () => {
    it('should handle unauthorized access attempts', async () => {
      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should validate member IDs exist before creating expense', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Invalid Member',
          amount: 100,
          paidBy: fakeId.toString(),
          sharedBy: [fakeId.toString()],
          date: new Date().toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('member');
    });

    it('should reject negative expense amounts', async () => {
      const member = await Member.create({ name: 'Alice' });

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Negative Amount',
          amount: -100,
          paidBy: member._id.toString(),
          sharedBy: [member._id.toString()],
          date: new Date().toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('positive');
    });

    it('should reject zero expense amounts', async () => {
      const member = await Member.create({ name: 'Alice' });

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Zero Amount',
          amount: 0,
          paidBy: member._id.toString(),
          sharedBy: [member._id.toString()],
          date: new Date().toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('positive');
    });
  });

  describe('Member Management Edge Cases', () => {
    it('should handle deleting member with existing expenses', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' }
      ]);

      const expense = await Expense.create({
        title: 'Expense with Alice',
        amount: 100,
        paidBy: members[0]._id,
        sharedBy: members.map(m => m._id),
        date: new Date(),
        memberCountAtTime: 2
      });

      // Try to delete member
      const response = await request(app)
        .delete(`/api/members/${members[0]._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Should either soft delete or prevent deletion
      expect([200, 400, 403]).toContain(response.status);
    });

    it('should handle duplicate member names', async () => {
      await Member.create({ name: 'Alice' });

      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Alice' });

      // Should allow duplicates (no unique constraint in current implementation)
      expect([200, 201, 400]).toContain(response.status);
    });

    it('should handle member name with special characters', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'José-María O\'Brien 李明' });

      expect(response.status).toBe(201);
      expect(response.body.member.name).toBe('José-María O\'Brien 李明');
    });

    it('should reject very long member names', async () => {
      const longName = 'A'.repeat(100);

      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: longName });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('50');
    });
  });

  describe('Real-World Complex Scenarios', () => {
    it('should handle a weekend trip with multiple expenses and mixed payers', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' },
        { name: 'Diana' }
      ]);

      // Day 1: Hotel - Alice pays
      const hotel = await Expense.create({
        title: 'Hotel - 2 nights',
        amount: 400,
        paidBy: members[0]._id,
        sharedBy: members.map(m => m._id),
        date: new Date('2024-01-05'),
        memberCountAtTime: 4
      });

      // Day 1: Dinner - Bob and Charlie split payment
      const dinner = await Expense.create({
        title: 'Dinner',
        amount: 160,
        payers: [
          { member: members[1]._id, amount: 80 },
          { member: members[2]._id, amount: 80 }
        ],
        sharedBy: members.map(m => m._id),
        date: new Date('2024-01-05'),
        memberCountAtTime: 4
      });

      // Day 2: Breakfast - Diana pays for 3 (Alice doesn't eat)
      const breakfast = await Expense.create({
        title: 'Breakfast',
        amount: 45,
        paidBy: members[3]._id,
        sharedBy: [members[1]._id, members[2]._id, members[3]._id],
        date: new Date('2024-01-06'),
        memberCountAtTime: 4
      });

      // Day 2: Gas - Alice pays
      const gas = await Expense.create({
        title: 'Gas',
        amount: 60,
        paidBy: members[0]._id,
        sharedBy: members.map(m => m._id),
        date: new Date('2024-01-06'),
        memberCountAtTime: 4
      });

      // Day 2: Lunch - Custom split (Alice and Bob eat more)
      const lunch = await Expense.create({
        title: 'Lunch',
        amount: 100,
        paidBy: members[2]._id,
        customShares: [
          { member: members[0]._id, amount: 35 },
          { member: members[1]._id, amount: 35 },
          { member: members[2]._id, amount: 15 },
          { member: members[3]._id, amount: 15 }
        ],
        sharedBy: members.map(m => m._id),
        date: new Date('2024-01-06'),
        memberCountAtTime: 4
      });

      const expenses = [hotel, dinner, gas, lunch, breakfast];
      const balances = calculateBalances(members, expenses, []);

      // Verify conservation of money
      const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
      expect(Math.abs(totalBalance)).toBeLessThan(0.01);

      // Generate optimal settlements
      const settlements = generateSettlements(balances);
      expect(settlements.length).toBeGreaterThan(0);
      expect(settlements.length).toBeLessThan(6); // Should be optimized

      // Verify settlements balance out
      const settlementTotal = settlements.reduce((sum, s) => sum + s.amount, 0);
      const positiveBalances = balances
        .filter(b => b.balance > 0)
        .reduce((sum, b) => sum + b.balance, 0);
      expect(Math.abs(settlementTotal - positiveBalances)).toBeLessThan(0.01);
    });

    it('should handle ongoing house expenses over a month', async () => {
      const members = await Member.create([
        { name: 'Roommate1' },
        { name: 'Roommate2' },
        { name: 'Roommate3' }
      ]);

      const monthlyExpenses = [];

      // Week 1: Various expenses
      monthlyExpenses.push(
        await Expense.create({
          title: 'Groceries Week 1',
          amount: 120,
          paidBy: members[0]._id,
          sharedBy: members.map(m => m._id),
          date: new Date('2024-01-07'),
          memberCountAtTime: 3
        }),
        await Expense.create({
          title: 'Internet Bill',
          amount: 60,
          paidBy: members[1]._id,
          sharedBy: members.map(m => m._id),
          date: new Date('2024-01-08'),
          memberCountAtTime: 3
        })
      );

      // Week 2
      monthlyExpenses.push(
        await Expense.create({
          title: 'Groceries Week 2',
          amount: 95,
          paidBy: members[2]._id,
          sharedBy: members.map(m => m._id),
          date: new Date('2024-01-14'),
          memberCountAtTime: 3
        }),
        await Expense.create({
          title: 'Electricity Bill',
          amount: 80,
          paidBy: members[0]._id,
          sharedBy: members.map(m => m._id),
          date: new Date('2024-01-15'),
          memberCountAtTime: 3
        })
      );

      // Week 3
      monthlyExpenses.push(
        await Expense.create({
          title: 'Groceries Week 3',
          amount: 110,
          paidBy: members[1]._id,
          sharedBy: members.map(m => m._id),
          date: new Date('2024-01-21'),
          memberCountAtTime: 3
        }),
        await Expense.create({
          title: 'House Cleaning',
          amount: 75,
          paidBy: members[2]._id,
          sharedBy: members.map(m => m._id),
          date: new Date('2024-01-22'),
          memberCountAtTime: 3
        })
      );

      // Week 4
      monthlyExpenses.push(
        await Expense.create({
          title: 'Groceries Week 4',
          amount: 105,
          paidBy: members[0]._id,
          sharedBy: members.map(m => m._id),
          date: new Date('2024-01-28'),
          memberCountAtTime: 3
        })
      );

      const balances = calculateBalances(members, monthlyExpenses, []);

      // Total expenses
      const totalExpenses = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
      expect(totalExpenses).toBe(645);

      // Each should have paid/owed ~215
      const avgPerPerson = totalExpenses / 3;
      expect(avgPerPerson).toBe(215);

      // Verify balances are reasonable
      balances.forEach(balance => {
        expect(Math.abs(balance.balance)).toBeLessThan(150);
      });

      // Generate settlements
      const settlements = generateSettlements(balances);
      expect(settlements.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Analytics and Statistics', () => {
    it('should calculate accurate statistics with many expenses', async () => {
      const members = await Member.create([
        { name: 'Alice' },
        { name: 'Bob' }
      ]);

      // Create 50 expenses
      const expenses = [];
      for (let i = 1; i <= 50; i++) {
        expenses.push({
          title: `Expense ${i}`,
          amount: i * 10,
          paidBy: members[i % 2]._id,
          sharedBy: members.map(m => m._id),
          date: new Date(`2024-01-${Math.min(i, 28)}`),
          memberCountAtTime: 2
        });
      }
      await Expense.create(expenses);

      const response = await request(app)
        .get('/api/expenses/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.totalExpenses).toBe(50);

      // Sum of 10 + 20 + ... + 500 = 12750
      const expectedTotal = (50 * (10 + 500)) / 2;
      expect(response.body.totalAmount).toBe(expectedTotal);
    });

    it('should handle analytics request with no data', async () => {
      const response = await request(app)
        .get('/api/expenses/analytics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.memberBreakdown).toEqual([]);
      expect(response.body.categoryBreakdown).toBeDefined();
      expect(response.body.timePeriodBreakdown).toEqual([]);
    });
  });
});
