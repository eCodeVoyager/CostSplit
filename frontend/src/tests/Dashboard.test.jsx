/**
 * Dashboard Component Tests
 * Tests the main dashboard functionality, stats display, and data fetching
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';

// Mock fetch
global.fetch = jest.fn();

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('Dashboard Component', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('should display loading state initially', () => {
      global.fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Successful Data Loading', () => {
    it('should display dashboard stats when data loads successfully', async () => {
      const mockStats = {
        totalExpenses: 15,
        totalAmount: 1250.50,
        memberCount: 4
      };

      const mockMembers = [
        { _id: '1', name: 'Alice', isActive: true },
        { _id: '2', name: 'Bob', isActive: true },
        { _id: '3', name: 'Charlie', isActive: true },
        { _id: '4', name: 'Diana', isActive: false }
      ];

      const mockExpenses = [
        {
          _id: '1',
          title: 'Groceries',
          amount: 120,
          date: '2024-01-15T00:00:00.000Z',
          paidBy: { _id: '1', name: 'Alice' },
          settled: false
        },
        {
          _id: '2',
          title: 'Rent',
          amount: 1000,
          date: '2024-01-10T00:00:00.000Z',
          paidBy: { _id: '2', name: 'Bob' },
          settled: false
        }
      ];

      const mockBalances = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 500 },
          { memberId: '2', memberName: 'Bob', balance: -200 },
          { memberId: '3', memberName: 'Charlie', balance: -300 }
        ],
        suggestedSettlements: [
          { from: 'Charlie', to: 'Alice', amount: 300 },
          { from: 'Bob', to: 'Alice', amount: 200 }
        ]
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockStats)
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMembers)
          });
        }
        if (url.includes('/api/expenses?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ expenses: mockExpenses })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalances)
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      // Wait for stats to load
      await waitFor(() => {
        expect(screen.getByText('15')).toBeInTheDocument(); // Total expenses
      });

      // Check if total amount is displayed
      expect(screen.getByText(/1,250\.50/)).toBeInTheDocument();

      // Check if member count is displayed (active members only)
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should display recent expenses correctly', async () => {
      const mockExpenses = [
        {
          _id: '1',
          title: 'Coffee',
          amount: 15.50,
          date: new Date().toISOString(),
          paidBy: { _id: '1', name: 'Alice' },
          settled: false
        },
        {
          _id: '2',
          title: 'Lunch',
          amount: 45.75,
          date: new Date(Date.now() - 86400000).toISOString(), // Yesterday
          paidBy: { _id: '2', name: 'Bob' },
          settled: true
        }
      ];

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ totalExpenses: 2, totalAmount: 61.25, memberCount: 2 })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { _id: '1', name: 'Alice', isActive: true },
              { _id: '2', name: 'Bob', isActive: true }
            ])
          });
        }
        if (url.includes('/api/expenses?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ expenses: mockExpenses })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              balances: [],
              suggestedSettlements: []
            })
          });
        }
      });

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Coffee')).toBeInTheDocument();
      });

      expect(screen.getByText('Lunch')).toBeInTheDocument();
      expect(screen.getByText(/15\.50/)).toBeInTheDocument();
      expect(screen.getByText(/45\.75/)).toBeInTheDocument();
    });

    it('should display pending settlements', async () => {
      const mockBalances = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 100 },
          { memberId: '2', memberName: 'Bob', balance: -100 }
        ],
        suggestedSettlements: [
          { from: 'Bob', to: 'Alice', amount: 100 }
        ]
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ totalExpenses: 0, totalAmount: 0, memberCount: 2 })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { _id: '1', name: 'Alice', isActive: true },
              { _id: '2', name: 'Bob', isActive: true }
            ])
          });
        }
        if (url.includes('/api/expenses?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ expenses: [] })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalances)
          });
        }
      });

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Bob/)).toBeInTheDocument();
      });

      expect(screen.getByText(/Alice/)).toBeInTheDocument();
      expect(screen.getByText(/100/)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when stats fetch fails', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses/stats')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Server error' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      });

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('should redirect to login when unauthorized', async () => {
      global.fetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: 'Unauthorized' })
        })
      );

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should handle network errors gracefully', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('should display message when no expenses exist', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ totalExpenses: 0, totalAmount: 0, memberCount: 0 })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
          });
        }
        if (url.includes('/api/expenses?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ expenses: [] })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              balances: [],
              suggestedSettlements: []
            })
          });
        }
      });

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument();
      });
    });
  });

  describe('Data Refresh', () => {
    it('should fetch fresh data on mount', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ totalExpenses: 5, totalAmount: 500, memberCount: 2 })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { _id: '1', name: 'Alice', isActive: true },
              { _id: '2', name: 'Bob', isActive: true }
            ])
          });
        }
        if (url.includes('/api/expenses?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ expenses: [] })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              balances: [],
              suggestedSettlements: []
            })
          });
        }
      });

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/expenses/stats'),
          expect.any(Object)
        );
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/members'),
        expect.any(Object)
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/expenses?'),
        expect.any(Object)
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/balances'),
        expect.any(Object)
      );
    });
  });

  describe('Currency Formatting', () => {
    it('should format currency amounts correctly', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              totalExpenses: 1,
              totalAmount: 1234567.89,
              memberCount: 1
            })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ _id: '1', name: 'Alice', isActive: true }])
          });
        }
        if (url.includes('/api/expenses?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ expenses: [] })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              balances: [],
              suggestedSettlements: []
            })
          });
        }
      });

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      );

      await waitFor(() => {
        // Should format with commas and 2 decimal places
        expect(screen.getByText(/1,234,567\.89/)).toBeInTheDocument();
      });
    });
  });
});
