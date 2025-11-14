const request = require('supertest');
const { app } = require('../../server');
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Member = require('../models/Member');

describe('Expense Controller', () => {
  let token;
  let testMember1, testMember2, testMember3;

  beforeAll(async () => {
    // Login to get token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: process.env.SHARED_USERNAME || 'admin',
        password: process.env.SHARED_PASSWORD || '1234',
      });
    token = response.body.token;

    // Create test members
    testMember1 = await Member.create({ name: 'Test Member 1' });
    testMember2 = await Member.create({ name: 'Test Member 2' });
    testMember3 = await Member.create({ name: 'Test Member 3' });
  }, 60000);

  afterAll(async () => {
    // Cleanup
    await Expense.deleteMany({});
    await Member.deleteMany({});
    await mongoose.disconnect();
  }, 30000);

  afterEach(async () => {
    // Clear expenses after each test
    await Expense.deleteMany({});
  }, 30000);

  describe('POST /api/expenses - createExpense', () => {
    it('should create expense with single payer', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Expense',
          amount: 100.50,
          paidBy: testMember1._id.toString(),
          date: new Date().toISOString()
        });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('Test Expense');
      expect(response.body.amount).toBe(100.50);
      expect(response.body.paidBy._id).toBe(testMember1._id.toString());
    });

    it('should create expense with multiple payers', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Split Expense',
          amount: 300,
          payers: [
            { member: testMember1._id.toString(), amount: 150 },
            { member: testMember2._id.toString(), amount: 150 }
          ],
          date: new Date().toISOString()
        });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('Split Expense');
      expect(response.body.amount).toBe(300);
      expect(response.body.payers).toHaveLength(2);
    });

    it('should reject expense without title', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 100,
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Expense title is required');
    });

    it('should reject expense with empty title', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: '   ',
          amount: 100,
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Expense title is required');
    });

    it('should sanitize title with XSS attempt', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: '<script>alert("xss")</script>Lunch',
          amount: 100,
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.title).not.toContain('<');
      expect(response.body.title).not.toContain('>');
    });

    it('should reject expense without amount', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount is required');
    });

    it('should reject expense with invalid amount (NaN)', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 'invalid',
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount must be a valid number');
    });

    it('should reject expense with zero amount', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 0,
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount must be greater than 0');
    });

    it('should reject expense with negative amount', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: -50,
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount must be greater than 0');
    });

    it('should reject expense with amount exceeding limit', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 20000000,
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount cannot exceed 10,000,000');
    });

    it('should reject expense without paidBy in single mode', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Paid by member is required');
    });

    it('should reject expense with invalid paidBy ID format', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100,
          paidBy: 'invalid-id'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid member ID format');
    });

    it('should reject expense with non-existent member', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100,
          paidBy: '507f1f77bcf86cd799439011' // Valid format but non-existent
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Selected member not found or inactive');
    });

    it('should reject expense with inactive member', async () => {
      const inactiveMember = await Member.create({ name: 'Inactive', isActive: false });

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100,
          paidBy: inactiveMember._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Selected member not found or inactive');

      await Member.findByIdAndDelete(inactiveMember._id);
    });

    it('should reject split payment with too many payers', async () => {
      const payers = Array(25).fill(null).map(() => ({
        member: testMember1._id.toString(),
        amount: 10
      }));

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 250,
          payers
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot have more than 20 payers');
    });

    it('should reject split payment with invalid payer member ID', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 200,
          payers: [
            { member: 'invalid-id', amount: 100 },
            { member: testMember2._id.toString(), amount: 100 }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid payer member ID format');
    });

    it('should reject split payment with payer amounts not matching total', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 300,
          payers: [
            { member: testMember1._id.toString(), amount: 150 },
            { member: testMember2._id.toString(), amount: 100 } // Total 250 != 300
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Total payer amounts');
    });

    it('should reject split payment with negative payer amount', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 200,
          payers: [
            { member: testMember1._id.toString(), amount: -50 },
            { member: testMember2._id.toString(), amount: 250 }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('must be greater than 0');
    });

    it('should reject expense with future date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100,
          paidBy: testMember1._id.toString(),
          date: futureDate.toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Expense date cannot be in the future');
    });

    it('should reject expense with date too far in past', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 6);

      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100,
          paidBy: testMember1._id.toString(),
          date: oldDate.toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Expense date cannot be more than 5 years in the past');
    });

    it('should reject expense with invalid date format', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100,
          paidBy: testMember1._id.toString(),
          date: 'invalid-date'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid date format');
    });

    it('should round amount to 2 decimal places', async () => {
      const response = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          amount: 100.999,
          paidBy: testMember1._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.amount).toBe(101);
    });
  });

  describe('GET /api/expenses - getAllExpenses', () => {
    beforeEach(async () => {
      // Create test expenses
      await Expense.create({
        title: 'Expense 1',
        amount: 100,
        paidBy: testMember1._id,
        date: new Date('2024-01-15'),
        memberCountAtTime: 3
      });
      await Expense.create({
        title: 'Expense 2',
        amount: 200,
        paidBy: testMember2._id,
        date: new Date('2024-02-20'),
        memberCountAtTime: 3
      });
      await Expense.create({
        title: 'Expense 3',
        amount: 300,
        paidBy: testMember3._id,
        date: new Date('2024-03-10'),
        memberCountAtTime: 3
      });
    });

    it('should get all expenses', async () => {
      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(3);
      expect(response.body.pagination.total).toBe(3);
    });

    it('should filter expenses by start date', async () => {
      const response = await request(app)
        .get('/api/expenses?startDate=2024-02-01')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(2); // Feb and Mar expenses
    });

    it('should filter expenses by end date', async () => {
      const response = await request(app)
        .get('/api/expenses?endDate=2024-02-28')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(2); // Jan and Feb expenses
    });

    it('should filter expenses by date range', async () => {
      const response = await request(app)
        .get('/api/expenses?startDate=2024-02-01&endDate=2024-02-28')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(1); // Only Feb expense
    });

    it('should reject invalid start date', async () => {
      const response = await request(app)
        .get('/api/expenses?startDate=invalid-date')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid start date format');
    });

    it('should reject invalid end date', async () => {
      const response = await request(app)
        .get('/api/expenses?endDate=invalid-date')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid end date format');
    });

    it('should paginate expenses', async () => {
      const response = await request(app)
        .get('/api/expenses?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.pages).toBe(2);
    });

    it('should limit max items per page to 1000', async () => {
      const response = await request(app)
        .get('/api/expenses?limit=5000')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(1000);
    });

    it('should return empty array when no expenses exist', async () => {
      await Expense.deleteMany({});

      const response = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.expenses).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });
  });

  describe('PATCH /api/expenses/:id/toggle-settled - toggleExpenseSettled', () => {
    let testExpense;

    beforeEach(async () => {
      testExpense = await Expense.create({
        title: 'Test Expense',
        amount: 100,
        paidBy: testMember1._id,
        date: new Date(),
        memberCountAtTime: 3
      });
    });

    it('should toggle expense to settled', async () => {
      const response = await request(app)
        .patch(`/api/expenses/${testExpense._id}/toggle-settled`)
        .set('Authorization', `Bearer ${token}`)
        .send({ settled: true });

      expect(response.status).toBe(200);
      expect(response.body.expense.settled).toBe(true);
      expect(response.body.expense.settledDate).toBeDefined();
      expect(response.body.message).toBe('Expense marked as settled');
    });

    it('should toggle expense to unsettled', async () => {
      testExpense.settled = true;
      testExpense.settledDate = new Date();
      await testExpense.save();

      const response = await request(app)
        .patch(`/api/expenses/${testExpense._id}/toggle-settled`)
        .set('Authorization', `Bearer ${token}`)
        .send({ settled: false });

      expect(response.status).toBe(200);
      expect(response.body.expense.settled).toBe(false);
      expect(response.body.expense.settledDate).toBeNull();
      expect(response.body.message).toBe('Expense marked as unsettled');
    });

    it('should toggle without explicit settled param', async () => {
      const response = await request(app)
        .patch(`/api/expenses/${testExpense._id}/toggle-settled`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.expense.settled).toBe(true);
    });

    it('should reject invalid expense ID format', async () => {
      const response = await request(app)
        .patch('/api/expenses/invalid-id/toggle-settled')
        .set('Authorization', `Bearer ${token}`)
        .send({ settled: true });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid expense ID');
    });

    it('should return 404 for non-existent expense', async () => {
      const response = await request(app)
        .patch('/api/expenses/507f1f77bcf86cd799439011/toggle-settled')
        .set('Authorization', `Bearer ${token}`)
        .send({ settled: true });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Expense not found');
    });
  });

  describe('DELETE /api/expenses/:id - deleteExpense', () => {
    let testExpense;

    beforeEach(async () => {
      testExpense = await Expense.create({
        title: 'Test Expense',
        amount: 100,
        paidBy: testMember1._id,
        date: new Date(),
        memberCountAtTime: 3
      });
    });

    it('should delete expense successfully', async () => {
      const response = await request(app)
        .delete(`/api/expenses/${testExpense._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Expense deleted successfully');
      expect(response.body.deletedExpense.title).toBe('Test Expense');

      // Verify deletion
      const deleted = await Expense.findById(testExpense._id);
      expect(deleted).toBeNull();
    });

    it('should reject invalid expense ID format', async () => {
      const response = await request(app)
        .delete('/api/expenses/invalid-id')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid expense ID');
    });

    it('should return 404 for non-existent expense', async () => {
      const response = await request(app)
        .delete('/api/expenses/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Expense not found');
    });
  });

  describe('GET /api/expenses/stats - getExpenseStats', () => {
    it('should return expense statistics', async () => {
      await Expense.create({
        title: 'Expense 1',
        amount: 100.50,
        paidBy: testMember1._id,
        date: new Date(),
        memberCountAtTime: 3
      });
      await Expense.create({
        title: 'Expense 2',
        amount: 200.75,
        paidBy: testMember2._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/expenses/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.totalExpenses).toBe(2);
      expect(response.body.totalAmount).toBe(301.25);
    });

    it('should return zero stats when no expenses exist', async () => {
      const response = await request(app)
        .get('/api/expenses/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.totalExpenses).toBe(0);
      expect(response.body.totalAmount).toBe(0);
    });
  });
});
