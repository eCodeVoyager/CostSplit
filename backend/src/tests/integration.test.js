/**
 * Integration Tests - Real User Scenarios
 * Tests complete user workflows from start to finish
 */

const request = require('supertest');
const { app } = require('../../server');
const Member = require('../models/Member');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');

describe('Integration Tests - Real User Scenarios', () => {
  let authToken;

  beforeAll(async () => {
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

  describe('Scenario 1: New User Onboarding', () => {
    it('should complete full workflow: login → add members → create expense → view balances', async () => {
      // Step 1: Login (already done in beforeAll)
      expect(authToken).toBeDefined();

      // Step 2: Add members
      const member1Response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Alice' });
      expect(member1Response.status).toBe(201);

      const member2Response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Bob' });
      expect(member2Response.status).toBe(201);

      const alice = member1Response.body.member;
      const bob = member2Response.body.member;

      // Step 3: Check member count
      const countResponse = await request(app)
        .get('/api/members/count')
        .set('Authorization', `Bearer ${authToken}`);
      expect(countResponse.body.count).toBe(2);

      // Step 4: Create first expense
      const expenseResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Lunch',
          amount: 50,
          paidBy: alice._id,
          sharedBy: [alice._id, bob._id],
          date: new Date().toISOString()
        });
      expect(expenseResponse.status).toBe(201);

      // Step 5: View balances
      const balancesResponse = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${authToken}`);
      expect(balancesResponse.status).toBe(200);
      expect(balancesResponse.body.balances.length).toBe(2);

      // Alice paid 50, owes 25 = +25
      const aliceBalance = balancesResponse.body.balances.find(
        b => b.memberName === 'Alice'
      );
      expect(aliceBalance.balance).toBe(25);

      // Bob owes 25
      const bobBalance = balancesResponse.body.balances.find(
        b => b.memberName === 'Bob'
      );
      expect(bobBalance.balance).toBe(-25);

      // Step 6: Check settlements
      expect(balancesResponse.body.suggestedSettlements.length).toBe(1);
      expect(balancesResponse.body.suggestedSettlements[0]).toMatchObject({
        from: 'Bob',
        to: 'Alice',
        amount: 25
      });
    });
  });

  describe('Scenario 2: Roommates Sharing Monthly Expenses', () => {
    it('should handle rent, utilities, and groceries over time with settlements', async () => {
      // Add roommates
      const members = await Promise.all([
        request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Alex' }),
        request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Sam' }),
        request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Jordan' })
      ]);

      const [alex, sam, jordan] = members.map(r => r.body.member);

      // Month 1: Add various expenses
      const rentResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Rent - January',
          amount: 1500,
          paidBy: alex._id,
          sharedBy: [alex._id, sam._id, jordan._id],
          date: '2024-01-01'
        });
      expect(rentResponse.status).toBe(201);

      const electricityResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Electricity',
          amount: 90,
          paidBy: sam._id,
          sharedBy: [alex._id, sam._id, jordan._id],
          date: '2024-01-05'
        });
      expect(electricityResponse.status).toBe(201);

      const groceriesResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Groceries Week 1',
          amount: 120,
          paidBy: jordan._id,
          sharedBy: [alex._id, sam._id, jordan._id],
          date: '2024-01-07'
        });
      expect(groceriesResponse.status).toBe(201);

      const internetResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Internet',
          amount: 60,
          paidBy: alex._id,
          sharedBy: [alex._id, sam._id, jordan._id],
          date: '2024-01-10'
        });
      expect(internetResponse.status).toBe(201);

      // Check balances after all expenses
      const balancesResponse = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${authToken}`);

      expect(balancesResponse.status).toBe(200);

      // Total = 1500 + 90 + 120 + 60 = 1770
      // Each person's share = 590
      // Alex paid: 1500 + 60 = 1560, owes 590 = +970
      // Sam paid: 90, owes 590 = -500
      // Jordan paid: 120, owes 590 = -470

      const alexBalance = balancesResponse.body.balances.find(b => b.memberName === 'Alex');
      const samBalance = balancesResponse.body.balances.find(b => b.memberName === 'Sam');
      const jordanBalance = balancesResponse.body.balances.find(b => b.memberName === 'Jordan');

      expect(alexBalance.balance).toBe(970);
      expect(samBalance.balance).toBe(-500);
      expect(jordanBalance.balance).toBe(-470);

      // Record settlements
      const settlement1Response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          from: sam._id,
          to: alex._id,
          amount: 500,
          note: 'January dues'
        });
      expect(settlement1Response.status).toBe(201);

      const settlement2Response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          from: jordan._id,
          to: alex._id,
          amount: 470,
          note: 'January dues'
        });
      expect(settlement2Response.status).toBe(201);

      // Check balances after settlements
      const updatedBalancesResponse = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${authToken}`);

      const updatedAlexBalance = updatedBalancesResponse.body.balances.find(
        b => b.memberName === 'Alex'
      );
      const updatedSamBalance = updatedBalancesResponse.body.balances.find(
        b => b.memberName === 'Sam'
      );
      const updatedJordanBalance = updatedBalancesResponse.body.balances.find(
        b => b.memberName === 'Jordan'
      );

      // After settlements, everyone should be settled
      expect(updatedAlexBalance.balance).toBe(0);
      expect(updatedSamBalance.balance).toBe(0);
      expect(updatedJordanBalance.balance).toBe(0);

      // Verify settlement history
      expect(updatedBalancesResponse.body.completedSettlements.length).toBe(2);
    });
  });

  describe('Scenario 3: Group Trip with Complex Splitting', () => {
    it('should handle a trip with multiple people paying different amounts', async () => {
      // Add trip members
      const memberNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
      const members = [];

      for (const name of memberNames) {
        const response = await request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name });
        members.push(response.body.member);
      }

      const [alice, bob, charlie, diana, eve] = members;

      // Day 1: Flight tickets - Alice pays for everyone
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Flight Tickets',
          amount: 1000,
          paidBy: alice._id,
          sharedBy: members.map(m => m._id),
          date: '2024-02-01'
        });

      // Day 1: Hotel - Bob and Charlie split payment
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Hotel Night 1',
          amount: 300,
          payers: [
            { member: bob._id, amount: 150 },
            { member: charlie._id, amount: 150 }
          ],
          sharedBy: members.map(m => m._id),
          date: '2024-02-01'
        });

      // Day 2: Breakfast - Only 4 people eat (Diana skips)
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Breakfast',
          amount: 80,
          paidBy: diana._id,
          sharedBy: [alice._id, bob._id, charlie._id, eve._id],
          date: '2024-02-02'
        });

      // Day 2: Lunch - Custom split (Alice and Bob eat more expensive meals)
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Lunch',
          amount: 150,
          paidBy: eve._id,
          customShares: [
            { member: alice._id, amount: 40 },
            { member: bob._id, amount: 40 },
            { member: charlie._id, amount: 30 },
            { member: diana._id, amount: 20 },
            { member: eve._id, amount: 20 }
          ],
          sharedBy: members.map(m => m._id),
          date: '2024-02-02'
        });

      // Day 2: Dinner - All share equally
      await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Dinner',
          amount: 200,
          paidBy: charlie._id,
          sharedBy: members.map(m => m._id),
          date: '2024-02-02'
        });

      // Get final balances
      const balancesResponse = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${authToken}`);

      expect(balancesResponse.status).toBe(200);

      // Verify all balances sum to 0
      const totalBalance = balancesResponse.body.balances.reduce(
        (sum, b) => sum + b.balance,
        0
      );
      expect(Math.abs(totalBalance)).toBeLessThan(0.01);

      // Get suggested settlements
      const settlements = balancesResponse.body.suggestedSettlements;
      expect(settlements.length).toBeGreaterThan(0);

      // Verify total settlement amount matches total owed
      const totalOwed = balancesResponse.body.balances
        .filter(b => b.balance < 0)
        .reduce((sum, b) => sum + Math.abs(b.balance), 0);

      const totalSettlements = settlements.reduce((sum, s) => sum + s.amount, 0);
      expect(Math.abs(totalSettlements - totalOwed)).toBeLessThan(0.01);
    });
  });

  describe('Scenario 4: Analytics and Reporting', () => {
    it('should provide accurate analytics for expense tracking', async () => {
      // Add members
      const alice = (await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Alice' })).body.member;

      const bob = (await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Bob' })).body.member;

      // Add expenses in different categories
      const expenses = [
        { title: 'Uber', amount: 25, category: 'transportation', date: '2024-01-05' },
        { title: 'Grocery Store', amount: 150, category: 'food', date: '2024-01-07' },
        { title: 'Amazon', amount: 80, category: 'shopping', date: '2024-01-10' },
        { title: 'Restaurant', amount: 120, category: 'food', date: '2024-01-15' },
        { title: 'Electric Bill', amount: 90, category: 'bills', date: '2024-01-20' },
        { title: 'Movie Tickets', amount: 40, category: 'entertainment', date: '2024-01-25' }
      ];

      for (const expense of expenses) {
        await request(app)
          .post('/api/expenses')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: expense.title,
            amount: expense.amount,
            paidBy: Math.random() > 0.5 ? alice._id : bob._id,
            sharedBy: [alice._id, bob._id],
            date: expense.date
          });
      }

      // Get analytics
      const analyticsResponse = await request(app)
        .get('/api/expenses/analytics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

      expect(analyticsResponse.status).toBe(200);

      const { memberBreakdown, categoryBreakdown, timePeriodBreakdown, topExpenses } =
        analyticsResponse.body;

      // Verify member breakdown
      expect(memberBreakdown).toHaveLength(2);
      expect(memberBreakdown.every(m => m.totalPaid >= 0)).toBe(true);
      expect(memberBreakdown.every(m => m.totalOwed >= 0)).toBe(true);

      // Verify category breakdown exists
      expect(categoryBreakdown).toBeDefined();
      expect(Object.keys(categoryBreakdown).length).toBeGreaterThan(0);

      // Verify time period breakdown
      expect(timePeriodBreakdown.length).toBeGreaterThan(0);

      // Verify top expenses
      expect(topExpenses).toBeDefined();
      expect(topExpenses.length).toBeLessThanOrEqual(10);

      // Get stats
      const statsResponse = await request(app)
        .get('/api/expenses/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.totalExpenses).toBe(6);
      expect(statsResponse.body.totalAmount).toBe(505); // Sum of all expenses
    });
  });

  describe('Scenario 5: Expense Modifications and Deletions', () => {
    it('should handle settling expenses and deleting them correctly', async () => {
      // Add members
      const members = await Promise.all([
        request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'User1' }),
        request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'User2' })
      ]);

      const [user1, user2] = members.map(r => r.body.member);

      // Create an expense
      const expenseResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Expense',
          amount: 100,
          paidBy: user1._id,
          sharedBy: [user1._id, user2._id],
          date: new Date().toISOString()
        });

      const expenseId = expenseResponse.body.expense._id;

      // Check initial balance
      let balancesResponse = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${authToken}`);

      let user1Balance = balancesResponse.body.balances.find(b => b.memberName === 'User1');
      expect(user1Balance.balance).toBe(50);

      // Mark expense as settled
      const settleResponse = await request(app)
        .patch(`/api/expenses/${expenseId}/settle`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(settleResponse.status).toBe(200);
      expect(settleResponse.body.expense.settled).toBe(true);

      // Verify settled expense still affects balances
      balancesResponse = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${authToken}`);

      user1Balance = balancesResponse.body.balances.find(b => b.memberName === 'User1');
      expect(user1Balance.balance).toBe(50);

      // Delete the expense
      const deleteResponse = await request(app)
        .delete(`/api/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(200);

      // Verify balances are now zero
      balancesResponse = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${authToken}`);

      balancesResponse.body.balances.forEach(balance => {
        expect(balance.balance).toBe(0);
      });
    });
  });

  describe('Scenario 6: Pagination and Filtering', () => {
    it('should handle large number of expenses with pagination', async () => {
      const member = (await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'TestUser' })).body.member;

      // Create 25 expenses
      for (let i = 1; i <= 25; i++) {
        await request(app)
          .post('/api/expenses')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Expense ${i}`,
            amount: i * 10,
            paidBy: member._id,
            sharedBy: [member._id],
            date: new Date(`2024-01-${String(i).padStart(2, '0')}`).toISOString()
          });
      }

      // Test pagination - page 1
      const page1Response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(page1Response.status).toBe(200);
      expect(page1Response.body.expenses.length).toBe(10);
      expect(page1Response.body.totalExpenses).toBe(25);
      expect(page1Response.body.totalPages).toBe(3);

      // Test pagination - page 2
      const page2Response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 2, limit: 10 });

      expect(page2Response.status).toBe(200);
      expect(page2Response.body.expenses.length).toBe(10);

      // Test pagination - page 3
      const page3Response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 3, limit: 10 });

      expect(page3Response.status).toBe(200);
      expect(page3Response.body.expenses.length).toBe(5);

      // Test date filtering
      const filteredResponse = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-01-10',
          endDate: '2024-01-15'
        });

      expect(filteredResponse.status).toBe(200);
      expect(filteredResponse.body.expenses.length).toBe(6); // Expenses 10-15

      // Test sorting
      const sortedResponse = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ sortBy: 'amount', sortOrder: 'desc', limit: 5 });

      expect(sortedResponse.status).toBe(200);
      expect(sortedResponse.body.expenses[0].amount).toBeGreaterThan(
        sortedResponse.body.expenses[4].amount
      );
    });
  });

  describe('Scenario 7: Error Recovery', () => {
    it('should handle errors gracefully and maintain data integrity', async () => {
      const member = (await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'TestUser' })).body.member;

      // Try to create expense with invalid data
      const invalidResponse = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: '', // Invalid: empty title
          amount: 100,
          paidBy: member._id,
          sharedBy: [member._id],
          date: new Date().toISOString()
        });

      expect(invalidResponse.status).toBe(400);

      // Verify no expense was created
      const expensesResponse = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`);

      expect(expensesResponse.body.expenses.length).toBe(0);

      // Try to delete non-existent member
      const fakeId = '507f1f77bcf86cd799439011';
      const deleteResponse = await request(app)
        .delete(`/api/members/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(404);

      // Try to settle non-existent expense
      const settleResponse = await request(app)
        .patch(`/api/expenses/${fakeId}/settle`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(settleResponse.status).toBe(404);
    });
  });
});
