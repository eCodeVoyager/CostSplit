const request = require('supertest');
const { app } = require('../../server');
const mongoose = require('mongoose');
const Member = require('../models/Member');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');

describe('Balance Controller', () => {
  let token;
  let member1, member2, member3;

  beforeAll(async () => {
    // Login
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: process.env.SHARED_USERNAME || 'admin',
        password: process.env.SHARED_PASSWORD || '1234',
      });
    token = response.body.token;

    // Create test members
    member1 = await Member.create({ name: 'Alice' });
    member2 = await Member.create({ name: 'Bob' });
    member3 = await Member.create({ name: 'Charlie' });
  }, 30000);

  afterAll(async () => {
    await Member.deleteMany({});
    await Expense.deleteMany({});
    await Settlement.deleteMany({});
    await mongoose.disconnect();
  }, 30000);

  afterEach(async () => {
    await Expense.deleteMany({});
    await Settlement.deleteMany({});
  }, 30000);

  describe('GET /api/balances - getBalances', () => {
    it('should return balances and settlements', async () => {
      // Create expenses
      await Expense.create({
        title: 'Lunch',
        amount: 300,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.balances).toBeDefined();
      expect(response.body.settlements).toBeDefined();
      expect(response.body.completedSettlements).toBeDefined();
    });

    it('should return empty when no members exist', async () => {
      await Member.deleteMany({});

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.balances).toEqual([]);
      expect(response.body.settlements).toEqual([]);
      expect(response.body.message).toBe('No active members found');

      // Restore members
      member1 = await Member.create({ name: 'Alice' });
      member2 = await Member.create({ name: 'Bob' });
      member3 = await Member.create({ name: 'Charlie' });
    });

    it('should calculate balances correctly for simple expense', async () => {
      await Expense.create({
        title: 'Dinner',
        amount: 600,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const alice = response.body.balances.find(b => b.name === 'Alice');
      const bob = response.body.balances.find(b => b.name === 'Bob');

      expect(alice.balance).toBe(400); // Paid 600 - owes 200
      expect(bob.balance).toBe(-200); // Owes 200
    });

    it('should include completed settlements', async () => {
      await Settlement.create({
        from: member2._id,
        to: member1._id,
        amount: 100,
        note: 'Test payment'
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.completedSettlements).toHaveLength(1);
      expect(response.body.completedSettlements[0].from).toBe('Bob');
      expect(response.body.completedSettlements[0].to).toBe('Alice');
      expect(response.body.completedSettlements[0].amount).toBe(100);
    });

    it('should handle multi-payer expenses correctly', async () => {
      // Create an expense with multiple payers
      await Expense.create({
        title: 'Split Payment',
        amount: 600,
        payers: [
          { member: member1._id, amount: 300 },
          { member: member2._id, amount: 300 }
        ],
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const alice = response.body.balances.find(b => b.name === 'Alice');
      const bob = response.body.balances.find(b => b.name === 'Bob');
      const charlie = response.body.balances.find(b => b.name === 'Charlie');

      // Each person owes 200, Alice and Bob paid 300 each
      expect(alice.balance).toBe(100); // Paid 300 - owes 200
      expect(bob.balance).toBe(100); // Paid 300 - owes 200
      expect(charlie.balance).toBe(-200); // Paid 0 - owes 200
    });

    it('should calculate balances for multiple expenses', async () => {
      await Expense.create({
        title: 'Expense 1',
        amount: 300,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      await Expense.create({
        title: 'Expense 2',
        amount: 600,
        paidBy: member2._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const alice = response.body.balances.find(b => b.name === 'Alice');
      const bob = response.body.balances.find(b => b.name === 'Bob');

      // Alice: Paid 300 - owes 300 = 0
      // Bob: Paid 600 - owes 300 = 300
      expect(alice.balance).toBe(0);
      expect(bob.balance).toBe(300);
    });

    it('should generate settlements correctly', async () => {
      await Expense.create({
        title: 'Dinner',
        amount: 900,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.settlements).toBeDefined();
      expect(response.body.settlements.length).toBeGreaterThan(0);

      // Should have settlements from debtors to creditor
      const settlement = response.body.settlements.find(
        s => s.from === 'Bob' && s.to === 'Alice'
      );
      expect(settlement).toBeDefined();
      expect(settlement.amount).toBe(300);
    });

    it('should handle complex multi-expense scenario', async () => {
      // Alice pays 1000
      await Expense.create({
        title: 'Hotel',
        amount: 1000,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      // Bob pays 500
      await Expense.create({
        title: 'Dinner',
        amount: 500,
        paidBy: member2._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      // Charlie pays 250
      await Expense.create({
        title: 'Taxi',
        amount: 250,
        paidBy: member3._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const alice = response.body.balances.find(b => b.name === 'Alice');
      const bob = response.body.balances.find(b => b.name === 'Bob');
      const charlie = response.body.balances.find(b => b.name === 'Charlie');

      // Total: 1750, per person: 583.33
      // Alice: 1000 - 583.33 = 416.67
      // Bob: 500 - 583.33 = -83.33
      // Charlie: 250 - 583.33 = -333.33
      expect(Math.round(alice.balance * 100)).toBe(41667);
      expect(Math.round(bob.balance * 100)).toBe(-8333);
      expect(Math.round(charlie.balance * 100)).toBe(-33333);
    });

    it('should handle settled expenses', async () => {
      // Create an unsettled expense
      await Expense.create({
        title: 'Unsettled',
        amount: 300,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 3,
        settled: false
      });

      // Create a settled expense
      await Expense.create({
        title: 'Settled',
        amount: 600,
        paidBy: member2._id,
        date: new Date(),
        memberCountAtTime: 3,
        settled: true
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const alice = response.body.balances.find(b => b.name === 'Alice');
      const bob = response.body.balances.find(b => b.name === 'Bob');

      // Both settled and unsettled should be included
      // Alice: 300 - 300 = 0
      // Bob: 600 - 300 = 300
      expect(alice.balance).toBe(0);
      expect(bob.balance).toBe(300);
    });

    it('should handle only inactive members scenario', async () => {
      // Delete all active members
      await Member.updateMany({}, { isActive: false });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.balances).toEqual([]);
      expect(response.body.settlements).toEqual([]);
      expect(response.body.message).toBe('No active members found');

      // Restore members
      await Member.updateMany({}, { isActive: true });
    });

    it('should return zero balances when no expenses exist', async () => {
      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.balances).toHaveLength(3);

      response.body.balances.forEach(balance => {
        expect(balance.balance).toBe(0);
      });

      expect(response.body.settlements).toEqual([]);
    });

    it('should handle mixed payers and settlements', async () => {
      // Alice pays 600
      await Expense.create({
        title: 'Groceries',
        amount: 600,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 3
      });

      // Bob pays back Alice 200
      await Settlement.create({
        from: member2._id,
        to: member1._id,
        amount: 200
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const alice = response.body.balances.find(b => b.name === 'Alice');
      const bob = response.body.balances.find(b => b.name === 'Bob');

      // Alice: 600 (paid) - 200 (share) + 200 (settlement) = 600
      // Bob: 0 (paid) - 200 (share) - 200 (settlement) = -400
      expect(alice.balance).toBe(600);
      expect(bob.balance).toBe(-400);

      expect(response.body.completedSettlements).toHaveLength(1);
    });

    it('should handle zero-balance scenario', async () => {
      // Each person pays their exact share
      await Expense.create({
        title: 'Split Expense',
        amount: 900,
        payers: [
          { member: member1._id, amount: 300 },
          { member: member2._id, amount: 300 },
          { member: member3._id, amount: 300 }
        ],
        date: new Date(),
        memberCountAtTime: 3
      });

      const response = await request(app)
        .get('/api/balances')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      response.body.balances.forEach(balance => {
        expect(balance.balance).toBe(0);
      });

      // No settlements needed when everyone is balanced
      expect(response.body.settlements).toEqual([]);
    });
  });
});
