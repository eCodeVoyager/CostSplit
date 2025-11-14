const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Start MongoDB Memory Server before all tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Set the MongoDB URI for tests
  process.env.MONGODB_URI = mongoUri;
  process.env.NODE_ENV = 'test';
}, 60000);

// Stop MongoDB Memory Server after all tests
afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);
