const request = require('supertest');
const { app } = require('../../server');
const mongoose = require('mongoose');

describe('Auth API', () => {
  afterAll(async () => {
    await mongoose.disconnect();
  }, 30000);

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: process.env.SHARED_USERNAME || 'admin',
          password: process.env.SHARED_PASSWORD || '1234',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.message).toBe('Login successful');
    });

    it('should reject incorrect credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'wrong',
          password: 'wrong',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should reject missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Username and password are required');
    });
  });

  describe('GET /api/auth/verify', () => {
    let token;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: process.env.SHARED_USERNAME || 'admin',
          password: process.env.SHARED_PASSWORD || '1234',
        });
      token = response.body.token;
    });

    it('should verify valid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Token is valid');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalidtoken');

      expect(response.status).toBe(403);
    });

    it('should reject missing token', async () => {
      const response = await request(app).get('/api/auth/verify');

      expect(response.status).toBe(401);
    });
  });
});
