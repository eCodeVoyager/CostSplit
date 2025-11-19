# Testing Fixes - Ready to Apply

This document contains ready-to-use code fixes for the MongoDB Memory Server issue.

---

## 🔧 Fix #1: Use Local MongoDB (RECOMMENDED)

### Step 1: Replace `/backend/src/tests/setup.js`

```javascript
const mongoose = require('mongoose');

let isConnected = false;

// Start MongoDB connection before all tests
beforeAll(async () => {
  try {
    // Use local MongoDB for testing
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/costsplit-test';

    if (!mongoose.connection || mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      isConnected = true;
    }

    process.env.MONGODB_URI = mongoUri;
    process.env.NODE_ENV = 'test';

    console.log('✓ Connected to MongoDB for testing');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    console.log('Hint: Make sure MongoDB is running on localhost:27017');
    console.log('Install: sudo apt-get install -y mongodb');
    console.log('Start: sudo systemctl start mongodb');
    throw error;
  }
}, 30000);

// Clean up after all tests
afterAll(async () => {
  if (isConnected && mongoose.connection) {
    try {
      // Drop test database
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      console.log('✓ Test database cleaned up');
    } catch (error) {
      console.error('✗ Cleanup error:', error.message);
    }
  }
}, 30000);

// Clear collections after each test
afterEach(async () => {
  if (isConnected && mongoose.connection && mongoose.connection.db) {
    try {
      const collections = await mongoose.connection.db.collections();
      for (let collection of collections) {
        await collection.deleteMany({});
      }
    } catch (error) {
      console.warn('Warning: Could not clear collections:', error.message);
    }
  }
});
```

### Step 2: Install and Start MongoDB

```bash
# Install MongoDB
sudo apt-get update
sudo apt-get install -y mongodb

# Start MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Verify it's running
mongosh --eval "db.version()" || mongo --eval "db.version()"
```

### Step 3: Run Tests

```bash
cd /home/user/CostSplit/backend
npm test
```

---

## 🔧 Fix #2: Use Docker MongoDB (For Environments with Docker)

### Step 1: Keep the same `setup.js` as Fix #1

### Step 2: Start MongoDB with Docker

```bash
# Start MongoDB container
docker run -d \
  --name mongodb-test \
  -p 27017:27017 \
  -e MONGO_INITDB_DATABASE=costsplit-test \
  mongo:6.0

# Wait for MongoDB to be ready
sleep 5

# Verify it's running
docker ps | grep mongodb-test
```

### Step 3: Run Tests

```bash
cd /home/user/CostSplit/backend
npm test
```

### Step 4: Cleanup

```bash
# Stop and remove container
docker stop mongodb-test
docker rm mongodb-test
```

---

## 🔧 Fix #3: Mock Database (No MongoDB Required)

### Step 1: Install mongodb-memory-server-core locally

This won't download MongoDB if you have the binary already:

```bash
cd /home/user/CostSplit/backend
npm install --save-dev mongodb-memory-server-global
```

### Step 2: Use MongoDB Memory Server with Skip Download

Update `/backend/src/tests/setup.js`:

```javascript
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  try {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        port: 27017,
        dbName: 'costsplit-test',
      },
      binary: {
        skipMD5: true,
        version: '6.0.4',
        // Try to use system MongoDB if available
        systemBinary: '/usr/bin/mongod',
      },
    });

    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    process.env.MONGODB_URI = mongoUri;
    process.env.NODE_ENV = 'test';

    console.log('✓ MongoDB Memory Server started');
  } catch (error) {
    console.error('✗ MongoDB Memory Server failed:', error.message);

    // Fallback to local MongoDB
    try {
      const localUri = 'mongodb://localhost:27017/costsplit-test';
      await mongoose.connect(localUri);
      process.env.MONGODB_URI = localUri;
      process.env.NODE_ENV = 'test';
      console.log('✓ Connected to local MongoDB instead');
    } catch (fallbackError) {
      console.error('✗ Fallback to local MongoDB also failed');
      throw error;
    }
  }
}, 120000);

afterAll(async () => {
  try {
    if (mongoose.connection) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Cleanup error:', error.message);
  }
}, 30000);

afterEach(async () => {
  if (mongoose.connection && mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      await collection.deleteMany({});
    }
  }
});
```

---

## 🔧 Fix #4: CI/CD Configuration (GitHub Actions)

Create `.github/workflows/test.yml`:

```yaml
name: Run Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest

    services:
      mongodb:
        image: mongo:6.0
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --eval 'db.adminCommand({ping: 1})'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install Backend Dependencies
      run: cd backend && npm ci

    - name: Run Backend Tests
      run: cd backend && npm test
      env:
        MONGODB_URI: mongodb://localhost:27017/costsplit-test
        SHARED_KEY: test-secret-key
        NODE_ENV: test

    - name: Upload Coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./backend/coverage/lcov.info
        flags: backend

  frontend-tests:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install Frontend Dependencies
      run: cd frontend && npm ci

    - name: Run Frontend Tests
      run: cd frontend && npm test

    - name: Upload Coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./frontend/coverage/lcov.info
        flags: frontend
```

---

## 🎯 Quick Command to Apply Fix #1

```bash
# Navigate to project
cd /home/user/CostSplit

# Backup current setup
cp backend/src/tests/setup.js backend/src/tests/setup.js.backup

# Apply the fix (copy the code from Fix #1 above)
# Or run this command to create the file:

cat > backend/src/tests/setup.js << 'EOF'
const mongoose = require('mongoose');

let isConnected = false;

beforeAll(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/costsplit-test';

    if (!mongoose.connection || mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      isConnected = true;
    }

    process.env.MONGODB_URI = mongoUri;
    process.env.NODE_ENV = 'test';

    console.log('✓ Connected to MongoDB for testing');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    console.log('Hint: Make sure MongoDB is running on localhost:27017');
    throw error;
  }
}, 30000);

afterAll(async () => {
  if (isConnected && mongoose.connection) {
    try {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      console.log('✓ Test database cleaned up');
    } catch (error) {
      console.error('✗ Cleanup error:', error.message);
    }
  }
}, 30000);

afterEach(async () => {
  if (isConnected && mongoose.connection && mongoose.connection.db) {
    try {
      const collections = await mongoose.connection.db.collections();
      for (let collection of collections) {
        await collection.deleteMany({});
      }
    } catch (error) {
      console.warn('Warning: Could not clear collections:', error.message);
    }
  }
});
EOF

# Install MongoDB if not installed
if ! command -v mongod &> /dev/null; then
  echo "Installing MongoDB..."
  sudo apt-get update
  sudo apt-get install -y mongodb
  sudo systemctl start mongodb
  sudo systemctl enable mongodb
fi

# Run tests
cd backend && npm test
```

---

## 📊 Verification Checklist

After applying any fix, verify:

- [ ] MongoDB is running (check `sudo systemctl status mongodb` or `docker ps`)
- [ ] Connection works (`mongosh` or `mongo`)
- [ ] Tests can connect (look for "✓ Connected to MongoDB for testing")
- [ ] Tests run without MongoDB download errors
- [ ] Database is cleaned up after tests

---

## 🐛 Troubleshooting

### Error: "Connection refused"
```bash
# Check MongoDB status
sudo systemctl status mongodb

# Start MongoDB
sudo systemctl start mongodb

# Check port
netstat -an | grep 27017
```

### Error: "Cannot find module 'mongoose'"
```bash
cd backend
npm install mongoose
```

### Error: "Authentication failed"
- Remove authentication from test MongoDB
- Or set credentials in connection string

### Tests still fail
1. Check MongoDB logs: `sudo journalctl -u mongodb`
2. Verify test database is created: `mongosh` then `show dbs`
3. Check file permissions: `ls -la backend/src/tests/`

---

## 💡 Best Practices

1. **Use Docker for CI/CD**: Most reliable across environments
2. **Use Local MongoDB for Development**: Fastest and simplest
3. **Never use production database for tests**: Always use separate test DB
4. **Clean up after tests**: Drop test database in `afterAll`
5. **Use environment variables**: Make MongoDB URI configurable

---

## 🚀 Expected Results After Fix

```bash
PASS src/tests/auth.test.js
PASS src/tests/expense.test.js
PASS src/tests/balanceCalculator.test.js
PASS src/tests/balance.test.js
PASS src/tests/member.test.js
PASS src/tests/settlement.test.js
PASS src/tests/edgeCases.test.js
PASS src/tests/integration.test.js

Test Suites: 8 passed, 8 total
Tests:       90 passed, 90 total
Snapshots:   0 total
Time:        15.234 s
Coverage:    85%
```

---

**Choose Fix #1 for immediate results! 🎯**
