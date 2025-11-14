const request = require('supertest');
const { app } = require('../../server');
const mongoose = require('mongoose');
const Member = require('../models/Member');
const Expense = require('../models/Expense');

describe('Member Controller', () => {
  let token;

  beforeAll(async () => {
    // Login to get token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: process.env.SHARED_USERNAME || 'admin',
        password: process.env.SHARED_PASSWORD || '1234',
      });
    token = response.body.token;
  }, 60000);

  afterAll(async () => {
    await Member.deleteMany({});
    await Expense.deleteMany({});
    await mongoose.disconnect();
  }, 30000);

  afterEach(async () => {
    await Member.deleteMany({});
    await Expense.deleteMany({});
  }, 30000);

  describe('POST /api/members - createMember', () => {
    it('should create a new member', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'John Doe' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('John Doe');
      expect(response.body.isActive).toBe(true);
    });

    it('should trim member name', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '  John Doe  ' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('John Doe');
    });

    it('should reject empty name', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Member name is required');
    });

    it('should reject whitespace-only name', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Member name is required');
    });

    it('should reject missing name', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Member name is required');
    });

    it('should sanitize XSS attempts in name', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '<script>alert("xss")</script>John' });

      expect(response.status).toBe(201);
      expect(response.body.name).not.toContain('<');
      expect(response.body.name).not.toContain('>');
    });

    it('should reject name with invalid characters', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'John@Doe!' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('can only contain letters');
    });

    it('should accept name with hyphens and underscores', async () => {
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'John-Doe_123' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('John-Doe_123');
    });

    it('should reject duplicate name (case-insensitive)', async () => {
      await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'John Doe' });

      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'john doe' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('A member with this name already exists');
    });

    it('should reject name exceeding 50 characters', async () => {
      const longName = 'A'.repeat(60);

      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: longName });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Member name cannot exceed 50 characters');
    });
  });

  describe('GET /api/members - getAllMembers', () => {
    beforeEach(async () => {
      await Member.create({ name: 'Member 1' });
      await Member.create({ name: 'Member 2' });
      await Member.create({ name: 'Member 3' });
    });

    it('should get all active members', async () => {
      const response = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
      expect(response.body[0].isActive).toBe(true);
    });

    it('should not return inactive members', async () => {
      await Member.create({ name: 'Inactive Member', isActive: false });

      const response = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
      expect(response.body.some(m => m.name === 'Inactive Member')).toBe(false);
    });

    it('should return empty array when no members exist', async () => {
      await Member.deleteMany({});

      const response = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should sort members by creation date', async () => {
      await Member.deleteMany({});

      // Create members in specific order
      await Member.create({ name: 'First' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await Member.create({ name: 'Second' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await Member.create({ name: 'Third' });

      const response = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body[0].name).toBe('First');
      expect(response.body[1].name).toBe('Second');
      expect(response.body[2].name).toBe('Third');
    });
  });

  describe('DELETE /api/members/:id - deleteMember', () => {
    let member1, member2;

    beforeEach(async () => {
      member1 = await Member.create({ name: 'Member 1' });
      member2 = await Member.create({ name: 'Member 2' });
    });

    it('should soft delete a member', async () => {
      const response = await request(app)
        .delete(`/api/members/${member1._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Member deleted successfully');
      expect(response.body.deletedMember.name).toBe('Member 1');

      // Verify soft delete (isActive = false)
      const deleted = await Member.findById(member1._id);
      expect(deleted.isActive).toBe(false);
    });

    it('should reject invalid member ID format', async () => {
      const response = await request(app)
        .delete('/api/members/invalid-id')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid member ID');
    });

    it('should return 404 for non-existent member', async () => {
      const response = await request(app)
        .delete('/api/members/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Member not found');
    });

    it('should return 404 for already deleted member', async () => {
      member1.isActive = false;
      await member1.save();

      const response = await request(app)
        .delete(`/api/members/${member1._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Member not found');
    });

    it('should reject deleting member with expenses', async () => {
      await Expense.create({
        title: 'Test Expense',
        amount: 100,
        paidBy: member1._id,
        date: new Date(),
        memberCountAtTime: 2
      });

      const response = await request(app)
        .delete(`/api/members/${member1._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('has 1 expense(s)');
    });

    it('should reject deleting last member', async () => {
      // Delete member2 first
      await Member.findByIdAndUpdate(member2._id, { isActive: false });

      const response = await request(app)
        .delete(`/api/members/${member1._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot delete the last member. At least one member must remain.');
    });
  });

  describe('GET /api/members/count - getMemberCount', () => {
    it('should return member count', async () => {
      await Member.create({ name: 'Member 1' });
      await Member.create({ name: 'Member 2' });
      await Member.create({ name: 'Member 3' });

      const response = await request(app)
        .get('/api/members/count')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(3);
    });

    it('should not count inactive members', async () => {
      await Member.create({ name: 'Active 1' });
      await Member.create({ name: 'Active 2' });
      await Member.create({ name: 'Inactive', isActive: false });

      const response = await request(app)
        .get('/api/members/count')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
    });

    it('should return zero when no members exist', async () => {
      const response = await request(app)
        .get('/api/members/count')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });
  });
});
