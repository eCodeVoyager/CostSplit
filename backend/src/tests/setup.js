const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Start MongoDB Memory Server before all tests
beforeAll(async () => {
  try {
    mongoServer = await MongoMemoryServer.create({
      binary: {
        version: '6.0.12', // Use a stable version
        downloadDir: './mongodb-binaries'
      }
    });
    const mongoUri = mongoServer.getUri();

    // Set the MongoDB URI for tests
    process.env.MONGODB_URI = mongoUri;
    process.env.NODE_ENV = 'test';
  } catch (error) {
    console.error('MongoDB Memory Server failed:', error.message);
    throw error;
  }
}, 120000);

// Stop MongoDB Memory Server after all tests
afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);
