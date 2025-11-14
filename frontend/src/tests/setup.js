import '@testing-library/jest-dom';

// Mock environment variables
process.env.VITE_API_URL = 'http://localhost:5000/api';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock window.confirm
global.confirm = jest.fn(() => true);
