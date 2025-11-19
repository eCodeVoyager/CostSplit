const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MONGODB_URI is set
    if (!process.env.MONGODB_URI) {
      if (process.env.NODE_ENV === 'test') {
        console.log('MongoDB URI not set in test environment, skipping connection');
        return;
      } else {
        throw new Error('MONGODB_URI environment variable is not set');
      }
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    // Don't exit process in test environment
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
