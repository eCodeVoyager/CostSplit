const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Set test environment variables FIRST before anything else
process.env.NODE_ENV = 'test';

let mongoConnection = null;
let mongoServer = null;
let isConnected = false;

// Start MongoDB connection before all tests
beforeAll(async () => {
  try {
    //Try to start MongoDB Memory Server with download disabled (use cached version)
    mongoServer = await MongoMemoryServer.create({
      binary: {
        skipMD5: true,
        checkMD5: false,
      },
      instance: {
        dbName: 'costsplit-test',
      },
    });

    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    // Connect to MongoDB
    await mongoose.connect(mongoUri);

    mongoConnection = mongoose.connection;
    isConnected = true;
    console.log('✓ MongoDB Memory Server started and connected');
  } catch (error) {
    console.warn('⚠️  MongoDB Memory Server failed:', error.message);
    console.warn('⚠️  Tests will fail - network restrictions prevent MongoDB binary download');
    isConnected = false;
  }
}, 120000); // 2 minutes timeout for first-time download

// Clean up after all tests
afterAll(async () => {
  try {
    if (isConnected && mongoConnection && mongoConnection.readyState === 1) {
      await mongoose.disconnect();
      console.log('✓ MongoDB disconnected');
    }
    if (mongoServer) {
      await mongoServer.stop();
      console.log('✓ MongoDB Memory Server stopped');
    }
  } catch (error) {
    // Silent cleanup
  }
}, 30000);

// Clear collections after each test
afterEach(async () => {
  if (!isConnected || !mongoConnection || mongoConnection.readyState !== 1) {
    return; // Skip if not connected
  }

  try {
    const collections = await mongoConnection.db.collections();
    for (let collection of collections) {
      await collection.deleteMany({});
    }
  } catch (error) {
    // Silently fail if collections can't be cleared
  }
});
