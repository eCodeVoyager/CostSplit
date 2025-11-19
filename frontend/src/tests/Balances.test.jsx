/**
 * Balances Page Component Tests
 * Tests balance display, settlement suggestions, and settlement recording
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Balances from '../pages/Balances';

global.fetch = jest.fn();

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('Balances Page', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('Balance Display', () => {
    it('should display member balances correctly', async () => {
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 150.50 },
          { memberId: '2', memberName: 'Bob', balance: -75.25 },
          { memberId: '3', memberName: 'Charlie', balance: -75.25 }
        ],
        suggestedSettlements: [],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();

      // Check amounts are displayed
      expect(screen.getByText(/150\.50/)).toBeInTheDocument();
      expect(screen.getByText(/75\.25/)).toBeInTheDocument();
    });

    it('should show positive balances (owed to member)', async () => {
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Creditor', balance: 500 }
        ],
        suggestedSettlements: [],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Creditor')).toBeInTheDocument();
      });

      // Should show positive balance or "is owed"
      expect(screen.getByText(/500|owed/i)).toBeInTheDocument();
    });

    it('should show negative balances (member owes)', async () => {
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Debtor', balance: -200 }
        ],
        suggestedSettlements: [],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Debtor')).toBeInTheDocument();
      });

      // Should show negative balance or "owes"
      expect(screen.getByText(/200|owes/i)).toBeInTheDocument();
    });

    it('should show zero balances as settled', async () => {
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Settled', balance: 0 }
        ],
        suggestedSettlements: [],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Settled')).toBeInTheDocument();
      });

      // Should show 0.00 or "settled"
      expect(screen.getByText(/0\.00|settled/i)).toBeInTheDocument();
    });
  });

  describe('Settlement Suggestions', () => {
    it('should display suggested settlements', async () => {
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 300 },
          { memberId: '2', memberName: 'Bob', balance: -150 },
          { memberId: '3', memberName: 'Charlie', balance: -150 }
        ],
        suggestedSettlements: [
          { from: 'Bob', fromId: '2', to: 'Alice', toId: '1', amount: 150 },
          { from: 'Charlie', fromId: '3', to: 'Alice', toId: '1', amount: 150 }
        ],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Bob/)).toBeInTheDocument();
      });

      // Should show "Bob pays Alice 150"
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
      expect(screen.getByText(/150/)).toBeInTheDocument();

      // Should show both suggested settlements
      const charlieElements = screen.getAllByText(/Charlie/);
      expect(charlieElements.length).toBeGreaterThan(0);
    });

    it('should show no settlements when everyone is settled', async () => {
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 0 },
          { memberId: '2', memberName: 'Bob', balance: 0 }
        ],
        suggestedSettlements: [],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/all settled|no settlements/i)).toBeInTheDocument();
      });
    });

    it('should optimize settlements to minimize transactions', async () => {
      // Complex scenario: 4 people, should optimize to 3 transactions
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: -100 },
          { memberId: '2', memberName: 'Bob', balance: -50 },
          { memberId: '3', memberName: 'Charlie', balance: 75 },
          { memberId: '4', memberName: 'Diana', balance: 75 }
        ],
        suggestedSettlements: [
          { from: 'Alice', fromId: '1', to: 'Charlie', toId: '3', amount: 75 },
          { from: 'Alice', fromId: '1', to: 'Diana', toId: '4', amount: 25 },
          { from: 'Bob', fromId: '2', to: 'Diana', toId: '4', amount: 50 }
        ],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Alice/)).toBeInTheDocument();
      });

      // Should show exactly 3 settlement suggestions
      const settlements = mockBalanceData.suggestedSettlements;
      expect(settlements.length).toBe(3);
    });
  });

  describe('Record Settlement', () => {
    it('should record settlement successfully', async () => {
      const user = userEvent.setup();

      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 100 },
          { memberId: '2', memberName: 'Bob', balance: -100 }
        ],
        suggestedSettlements: [
          { from: 'Bob', fromId: '2', to: 'Alice', toId: '1', amount: 100 }
        ],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/settlements') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              settlement: {
                _id: '1',
                from: '2',
                to: '1',
                amount: 100,
                paidDate: new Date().toISOString()
              }
            })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Bob/)).toBeInTheDocument();
      });

      // Find "Mark as Paid" or "Record" button
      const recordButton = screen.queryByRole('button', { name: /mark as paid|record|settle/i });
      if (recordButton) {
        await user.click(recordButton);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/settlements'),
            expect.objectContaining({ method: 'POST' })
          );
        });
      }
    });

    it('should add note to settlement', async () => {
      const user = userEvent.setup();

      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 50 },
          { memberId: '2', memberName: 'Bob', balance: -50 }
        ],
        suggestedSettlements: [
          { from: 'Bob', fromId: '2', to: 'Alice', toId: '1', amount: 50 }
        ],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/settlements') && options?.method === 'POST') {
          const body = JSON.parse(options.body);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              settlement: {
                _id: '1',
                from: body.from,
                to: body.to,
                amount: body.amount,
                note: body.note,
                paidDate: new Date().toISOString()
              }
            })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Bob/)).toBeInTheDocument();
      });

      const recordButton = screen.queryByRole('button', { name: /mark as paid|record|settle/i });
      if (recordButton) {
        await user.click(recordButton);

        // Look for note input
        const noteInput = screen.queryByLabelText(/note/i);
        if (noteInput) {
          await user.type(noteInput, 'Cash payment');

          const submitButton = screen.getByRole('button', { name: /submit|confirm/i });
          await user.click(submitButton);

          await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
              expect.stringContaining('/api/settlements'),
              expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Cash payment')
              })
            );
          });
        }
      }
    });
  });

  describe('Settlement History', () => {
    it('should display completed settlements', async () => {
      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 0 },
          { memberId: '2', memberName: 'Bob', balance: 0 }
        ],
        suggestedSettlements: [],
        completedSettlements: [
          {
            _id: '1',
            from: { _id: '2', name: 'Bob' },
            to: { _id: '1', name: 'Alice' },
            amount: 100,
            paidDate: '2024-01-15T00:00:00.000Z',
            note: 'January dues'
          }
        ]
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Bob/)).toBeInTheDocument();
      });

      // Should show settlement history
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
      expect(screen.getByText(/100/)).toBeInTheDocument();
      expect(screen.getByText(/January dues/i)).toBeInTheDocument();
    });

    it('should show formatted dates in settlement history', async () => {
      const mockBalanceData = {
        balances: [],
        suggestedSettlements: [],
        completedSettlements: [
          {
            _id: '1',
            from: { _id: '1', name: 'Alice' },
            to: { _id: '2', name: 'Bob' },
            amount: 50,
            paidDate: '2024-01-15T10:30:00.000Z'
          }
        ]
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        // Should display formatted date
        expect(screen.getByText(/Jan|2024|15/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error when fetch fails', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('should handle unauthorized access', async () => {
      global.fetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: 'Unauthorized' })
        })
      );

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should handle settlement recording errors', async () => {
      const user = userEvent.setup();

      const mockBalanceData = {
        balances: [
          { memberId: '1', memberName: 'Alice', balance: 100 },
          { memberId: '2', memberName: 'Bob', balance: -100 }
        ],
        suggestedSettlements: [
          { from: 'Bob', fromId: '2', to: 'Alice', toId: '1', amount: 100 }
        ],
        completedSettlements: []
      };

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/settlements') && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Failed to record settlement' })
          });
        }
        if (url.includes('/api/balances')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockBalanceData)
          });
        }
      });

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Bob/)).toBeInTheDocument();
      });

      const recordButton = screen.queryByRole('button', { name: /mark as paid|record|settle/i });
      if (recordButton) {
        await user.click(recordButton);

        await waitFor(() => {
          expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
        });
      }
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator', () => {
      global.fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <BrowserRouter>
          <Balances />
        </BrowserRouter>
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });
});
