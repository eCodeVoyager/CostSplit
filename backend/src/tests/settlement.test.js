const request = require('supertest');
const { app } = require('../../server');
const mongoose = require('mongoose');
const Member = require('../models/Member');
const Settlement = require('../models/Settlement');

describe('Settlement Controller', () => {
  let token;
  let member1, member2;

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
  }, 30000);

  afterAll(async () => {
    await Member.deleteMany({});
    await Settlement.deleteMany({});
    await mongoose.disconnect();
  }, 30000);

  afterEach(async () => {
    await Settlement.deleteMany({});
  }, 30000);

  describe('POST /api/settlements - markSettlementPaid', () => {
    it('should create a settlement', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: member1._id.toString(),
          amount: 150.50,
          note: 'Lunch payment'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Settlement marked as paid');
      expect(response.body.settlement.from).toBe('Bob');
      expect(response.body.settlement.to).toBe('Alice');
      expect(response.body.settlement.amount).toBe(150.50);
      expect(response.body.settlement.note).toBe('Lunch payment');
    });

    it('should reject settlement without from', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          to: member1._id.toString(),
          amount: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('From, to, and amount are required');
    });

    it('should reject settlement without to', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          amount: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('From, to, and amount are required');
    });

    it('should reject settlement without amount', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: member1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('From, to, and amount are required');
    });

    it('should reject settlement with invalid amount', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: member1._id.toString(),
          amount: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount must be greater than 0');
    });

    it('should reject settlement with zero amount', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: member1._id.toString(),
          amount: 0
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount must be greater than 0');
    });

    it('should reject settlement with negative amount', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: member1._id.toString(),
          amount: -50
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Amount must be greater than 0');
    });

    it('should reject settlement to non-existent member', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: '507f1f77bcf86cd799439011',
          amount: 100
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('One or both members not found');
    });

    it('should reject settlement to same person', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member1._id.toString(),
          to: member1._id.toString(),
          amount: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot create settlement to the same person');
    });

    it('should round amount to 2 decimal places', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: member1._id.toString(),
          amount: 100.999
        });

      expect(response.status).toBe(201);
      expect(response.body.settlement.amount).toBe(101);
    });

    it('should create settlement without note', async () => {
      const response = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${token}`)
        .send({
          from: member2._id.toString(),
          to: member1._id.toString(),
          amount: 100
        });

      expect(response.status).toBe(201);
      expect(response.body.settlement.note).toBeUndefined();
    });
  });

  describe('GET /api/settlements/history - getSettlementHistory', () => {
    beforeEach(async () => {
      // Create settlements with different dates
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 8);
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 2);

      await Settlement.create({
        from: member2._id,
        to: member1._id,
        amount: 100,
        paidDate: today
      });
      await Settlement.create({
        from: member2._id,
        to: member1._id,
        amount: 200,
        paidDate: yesterday
      });
      await Settlement.create({
        from: member2._id,
        to: member1._id,
        amount: 300,
        paidDate: lastWeek
      });
      await Settlement.create({
        from: member2._id,
        to: member1._id,
        amount: 400,
        paidDate: lastMonth
      });
    });

    it('should get all settlements', async () => {
      const response = await request(app)
        .get('/api/settlements/history')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.settlements).toHaveLength(4);
    });

    it('should filter by today', async () => {
      const response = await request(app)
        .get('/api/settlements/history?period=today')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.settlements.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by week', async () => {
      const response = await request(app)
        .get('/api/settlements/history?period=week')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.settlements.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by month', async () => {
      const response = await request(app)
        .get('/api/settlements/history?period=month')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.settlements.length).toBeGreaterThanOrEqual(3);
    });

    it('should return empty array when no settlements exist', async () => {
      await Settlement.deleteMany({});

      const response = await request(app)
        .get('/api/settlements/history')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.settlements).toHaveLength(0);
    });
  });

  describe('DELETE /api/settlements/:id - deleteSettlement', () => {
    let settlement;

    beforeEach(async () => {
      settlement = await Settlement.create({
        from: member2._id,
        to: member1._id,
        amount: 100
      });
    });

    it('should delete a settlement', async () => {
      const response = await request(app)
        .delete(`/api/settlements/${settlement._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Settlement deleted successfully');

      // Verify deletion
      const deleted = await Settlement.findById(settlement._id);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent settlement', async () => {
      const response = await request(app)
        .delete('/api/settlements/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Settlement not found');
    });
  });
});
