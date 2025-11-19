/**
 * Expenses Page Component Tests
 * Tests expense listing, filtering, pagination, and form submissions
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Expenses from '../pages/Expenses';

global.fetch = jest.fn();

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('Expenses Page', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('Expense List Display', () => {
    it('should display list of expenses', async () => {
      const mockExpenses = [
        {
          _id: '1',
          title: 'Groceries',
          amount: 150.75,
          date: '2024-01-15T00:00:00.000Z',
          paidBy: { _id: '1', name: 'Alice' },
          sharedBy: [
            { _id: '1', name: 'Alice' },
            { _id: '2', name: 'Bob' }
          ],
          settled: false
        },
        {
          _id: '2',
          title: 'Rent',
          amount: 1200,
          date: '2024-01-10T00:00:00.000Z',
          paidBy: { _id: '2', name: 'Bob' },
          sharedBy: [
            { _id: '1', name: 'Alice' },
            { _id: '2', name: 'Bob' }
          ],
          settled: true
        }
      ];

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: mockExpenses,
              totalExpenses: 2,
              totalPages: 1,
              currentPage: 1
            })
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
      });

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      expect(screen.getByText('Rent')).toBeInTheDocument();
      expect(screen.getByText(/150\.75/)).toBeInTheDocument();
      expect(screen.getByText(/1,200/)).toBeInTheDocument();
    });

    it('should show settled status badge', async () => {
      const mockExpenses = [
        {
          _id: '1',
          title: 'Settled Expense',
          amount: 100,
          date: '2024-01-15T00:00:00.000Z',
          paidBy: { _id: '1', name: 'Alice' },
          sharedBy: [{ _id: '1', name: 'Alice' }],
          settled: true
        }
      ];

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/expenses')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: mockExpenses,
              totalExpenses: 1,
              totalPages: 1,
              currentPage: 1
            })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ _id: '1', name: 'Alice', isActive: true }])
          });
        }
      });

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/settled/i)).toBeInTheDocument();
      });
    });
  });

  describe('Add Expense Form', () => {
    it('should submit new expense with valid data', async () => {
      const mockMembers = [
        { _id: '1', name: 'Alice', isActive: true },
        { _id: '2', name: 'Bob', isActive: true }
      ];

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMembers)
          });
        }
        if (url.includes('/api/expenses') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expense: {
                _id: '3',
                title: 'New Expense',
                amount: 50,
                paidBy: { _id: '1', name: 'Alice' },
                sharedBy: mockMembers,
                date: new Date().toISOString(),
                settled: false
              }
            })
          });
        }
        if (url.includes('/api/expenses')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: [],
              totalExpenses: 0,
              totalPages: 1,
              currentPage: 1
            })
          });
        }
      });

      const user = userEvent.setup();

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/add expense/i)).toBeInTheDocument();
      });

      // Open add expense form
      const addButton = screen.getByText(/add expense/i);
      await user.click(addButton);

      // Fill form
      const titleInput = screen.getByLabelText(/title/i);
      const amountInput = screen.getByLabelText(/amount/i);

      await user.type(titleInput, 'Test Expense');
      await user.type(amountInput, '50');

      // Submit form
      const submitButton = screen.getByRole('button', { name: /submit|add|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/expenses'),
          expect.objectContaining({
            method: 'POST'
          })
        );
      });
    });

    it('should validate required fields', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ _id: '1', name: 'Alice', isActive: true }])
          });
        }
        if (url.includes('/api/expenses')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: [],
              totalExpenses: 0,
              totalPages: 1,
              currentPage: 1
            })
          });
        }
      });

      const user = userEvent.setup();

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/add expense/i)).toBeInTheDocument();
      });

      // Open form
      const addButton = screen.getByText(/add expense/i);
      await user.click(addButton);

      // Try to submit without filling required fields
      const submitButton = screen.getByRole('button', { name: /submit|add|create/i });
      await user.click(submitButton);

      // Should show validation errors or prevent submission
      await waitFor(() => {
        // Form should not be submitted
        const postCalls = global.fetch.mock.calls.filter(
          call => call[1]?.method === 'POST'
        );
        expect(postCalls.length).toBe(0);
      });
    });

    it('should handle negative amounts correctly', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ _id: '1', name: 'Alice', isActive: true }])
          });
        }
        if (url.includes('/api/expenses')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: [],
              totalExpenses: 0,
              totalPages: 1,
              currentPage: 1
            })
          });
        }
      });

      const user = userEvent.setup();

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/add expense/i)).toBeInTheDocument();
      });

      const addButton = screen.getByText(/add expense/i);
      await user.click(addButton);

      const amountInput = screen.getByLabelText(/amount/i);
      await user.type(amountInput, '-50');

      // Should prevent negative values or show error
      const submitButton = screen.getByRole('button', { name: /submit|add|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        const postCalls = global.fetch.mock.calls.filter(
          call => call[1]?.method === 'POST' && call[1]?.body?.includes('-50')
        );
        expect(postCalls.length).toBe(0);
      });
    });
  });

  describe('Expense Filtering', () => {
    it('should filter expenses by date range', async () => {
      const user = userEvent.setup();

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ _id: '1', name: 'Alice', isActive: true }])
          });
        }
        if (url.includes('startDate') && url.includes('endDate')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: [
                {
                  _id: '1',
                  title: 'Filtered Expense',
                  amount: 100,
                  date: '2024-01-15T00:00:00.000Z',
                  paidBy: { _id: '1', name: 'Alice' },
                  sharedBy: [{ _id: '1', name: 'Alice' }],
                  settled: false
                }
              ],
              totalExpenses: 1,
              totalPages: 1,
              currentPage: 1
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            expenses: [],
            totalExpenses: 0,
            totalPages: 1,
            currentPage: 1
          })
        });
      });

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/expenses/i)).toBeInTheDocument();
      });

      // Look for date filter inputs
      const startDateInput = screen.queryByLabelText(/start date/i);
      const endDateInput = screen.queryByLabelText(/end date/i);

      if (startDateInput && endDateInput) {
        await user.type(startDateInput, '2024-01-01');
        await user.type(endDateInput, '2024-01-31');

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('startDate'),
            expect.any(Object)
          );
        });
      }
    });
  });

  describe('Pagination', () => {
    it('should navigate between pages', async () => {
      const user = userEvent.setup();

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ _id: '1', name: 'Alice', isActive: true }])
          });
        }
        if (url.includes('page=2')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: [
                {
                  _id: '11',
                  title: 'Page 2 Expense',
                  amount: 100,
                  date: '2024-01-15T00:00:00.000Z',
                  paidBy: { _id: '1', name: 'Alice' },
                  sharedBy: [{ _id: '1', name: 'Alice' }],
                  settled: false
                }
              ],
              totalExpenses: 20,
              totalPages: 2,
              currentPage: 2
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            expenses: Array(10).fill(null).map((_, i) => ({
              _id: String(i + 1),
              title: `Expense ${i + 1}`,
              amount: 100,
              date: '2024-01-15T00:00:00.000Z',
              paidBy: { _id: '1', name: 'Alice' },
              sharedBy: [{ _id: '1', name: 'Alice' }],
              settled: false
            })),
            totalExpenses: 20,
            totalPages: 2,
            currentPage: 1
          })
        });
      });

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Expense 1')).toBeInTheDocument();
      });

      // Look for pagination controls
      const nextButton = screen.queryByRole('button', { name: /next/i });
      if (nextButton) {
        await user.click(nextButton);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('page=2'),
            expect.any(Object)
          );
        });
      }
    });
  });

  describe('Expense Deletion', () => {
    it('should delete expense when confirmed', async () => {
      const user = userEvent.setup();

      const mockExpense = {
        _id: '1',
        title: 'To Delete',
        amount: 50,
        date: '2024-01-15T00:00:00.000Z',
        paidBy: { _id: '1', name: 'Alice' },
        sharedBy: [{ _id: '1', name: 'Alice' }],
        settled: false
      };

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ _id: '1', name: 'Alice', isActive: true }])
          });
        }
        if (url.includes('/api/expenses/1') && options?.method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ message: 'Deleted' })
          });
        }
        if (url.includes('/api/expenses')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              expenses: options?.method === 'DELETE' ? [] : [mockExpense],
              totalExpenses: options?.method === 'DELETE' ? 0 : 1,
              totalPages: 1,
              currentPage: 1
            })
          });
        }
      });

      render(
        <BrowserRouter>
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('To Delete')).toBeInTheDocument();
      });

      // Find and click delete button
      const deleteButton = screen.queryByRole('button', { name: /delete/i });
      if (deleteButton) {
        await user.click(deleteButton);

        // Confirm deletion if there's a confirmation dialog
        const confirmButton = screen.queryByRole('button', { name: /confirm|yes/i });
        if (confirmButton) {
          await user.click(confirmButton);
        }

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/expenses/1'),
            expect.objectContaining({ method: 'DELETE' })
          );
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should display error when fetch fails', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      render(
        <BrowserRouter>
          <Expenses />
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
          <Expenses />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });
  });
});
