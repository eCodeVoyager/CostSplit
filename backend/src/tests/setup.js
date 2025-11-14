// Test setup file
require('dotenv').config({ path: '.env.example' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/costsplit_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.SHARED_USERNAME = process.env.SHARED_USERNAME || 'admin';
process.env.SHARED_PASSWORD = process.env.SHARED_PASSWORD || '1234';

// Increase timeout for tests
jest.setTimeout(10000);
