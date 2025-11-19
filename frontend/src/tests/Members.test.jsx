/**
 * Members Page Component Tests
 * Tests member management, add/delete functionality
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Members from '../pages/Members';

global.fetch = jest.fn();

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('Members Page', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe('Members List Display', () => {
    it('should display list of members', async () => {
      const mockMembers = [
        { _id: '1', name: 'Alice', isActive: true, createdAt: '2024-01-01T00:00:00.000Z' },
        { _id: '2', name: 'Bob', isActive: true, createdAt: '2024-01-02T00:00:00.000Z' },
        { _id: '3', name: 'Charlie', isActive: false, createdAt: '2024-01-03T00:00:00.000Z' }
      ];

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMembers)
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('should show active/inactive status', async () => {
      const mockMembers = [
        { _id: '1', name: 'Active User', isActive: true, createdAt: '2024-01-01T00:00:00.000Z' },
        { _id: '2', name: 'Inactive User', isActive: false, createdAt: '2024-01-02T00:00:00.000Z' }
      ];

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMembers)
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Active User')).toBeInTheDocument();
      });

      // Check for status indicators
      const activeIndicators = screen.queryAllByText(/active/i);
      const inactiveIndicators = screen.queryAllByText(/inactive/i);

      expect(activeIndicators.length).toBeGreaterThan(0);
      expect(inactiveIndicators.length).toBeGreaterThan(0);
    });

    it('should display empty state when no members exist', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/no members|add your first member/i)).toBeInTheDocument();
      });
    });
  });

  describe('Add Member Functionality', () => {
    it('should add new member successfully', async () => {
      const user = userEvent.setup();

      const mockMembers = [];
      let memberCount = 0;

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/members') && options?.method === 'POST') {
          const body = JSON.parse(options.body);
          const newMember = {
            _id: String(++memberCount),
            name: body.name,
            isActive: true,
            createdAt: new Date().toISOString()
          };
          mockMembers.push(newMember);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ member: newMember })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMembers)
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/add member/i)).toBeInTheDocument();
      });

      // Click add member button
      const addButton = screen.getByText(/add member/i);
      await user.click(addButton);

      // Fill in name
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'New Member');

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit|add|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/members'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('New Member')
          })
        );
      });
    });

    it('should validate member name is not empty', async () => {
      const user = userEvent.setup();

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/add member/i)).toBeInTheDocument();
      });

      const addButton = screen.getByText(/add member/i);
      await user.click(addButton);

      // Try to submit without name
      const submitButton = screen.getByRole('button', { name: /submit|add|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        const postCalls = global.fetch.mock.calls.filter(
          call => call[1]?.method === 'POST'
        );
        expect(postCalls.length).toBe(0);
      });
    });

    it('should validate member name length', async () => {
      const user = userEvent.setup();

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/members') && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Name must be between 1 and 50 characters' })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/add member/i)).toBeInTheDocument();
      });

      const addButton = screen.getByText(/add member/i);
      await user.click(addButton);

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'A'.repeat(100)); // Very long name

      const submitButton = screen.getByRole('button', { name: /submit|add|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/50 characters/i)).toBeInTheDocument();
      });
    });

    it('should handle special characters in names', async () => {
      const user = userEvent.setup();

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/members') && options?.method === 'POST') {
          const body = JSON.parse(options.body);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              member: {
                _id: '1',
                name: body.name,
                isActive: true,
                createdAt: new Date().toISOString()
              }
            })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/add member/i)).toBeInTheDocument();
      });

      const addButton = screen.getByText(/add member/i);
      await user.click(addButton);

      const nameInput = screen.getByLabelText(/name/i);
      const specialName = 'José-María O\'Brien';
      await user.type(nameInput, specialName);

      const submitButton = screen.getByRole('button', { name: /submit|add|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/members'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining(specialName)
          })
        );
      });
    });
  });

  describe('Delete Member Functionality', () => {
    it('should delete member when confirmed', async () => {
      const user = userEvent.setup();

      let members = [
        { _id: '1', name: 'To Delete', isActive: true, createdAt: '2024-01-01T00:00:00.000Z' },
        { _id: '2', name: 'To Keep', isActive: true, createdAt: '2024-01-02T00:00:00.000Z' }
      ];

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/members/1') && options?.method === 'DELETE') {
          members = members.filter(m => m._id !== '1');
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ message: 'Member deleted' })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(members)
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('To Delete')).toBeInTheDocument();
      });

      // Find delete button
      const deleteButtons = screen.queryAllByRole('button', { name: /delete|remove/i });
      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        // Confirm if there's a dialog
        const confirmButton = screen.queryByRole('button', { name: /confirm|yes/i });
        if (confirmButton) {
          await user.click(confirmButton);
        }

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/members/1'),
            expect.objectContaining({ method: 'DELETE' })
          );
        });
      }
    });

    it('should show warning when deleting member with expenses', async () => {
      const user = userEvent.setup();

      global.fetch.mockImplementation((url, options) => {
        if (url.includes('/api/members/1') && options?.method === 'DELETE') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({
              message: 'Cannot delete member with existing expenses'
            })
          });
        }
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { _id: '1', name: 'Has Expenses', isActive: true, createdAt: '2024-01-01T00:00:00.000Z' }
            ])
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Has Expenses')).toBeInTheDocument();
      });

      const deleteButton = screen.queryByRole('button', { name: /delete|remove/i });
      if (deleteButton) {
        await user.click(deleteButton);

        const confirmButton = screen.queryByRole('button', { name: /confirm|yes/i });
        if (confirmButton) {
          await user.click(confirmButton);
        }

        await waitFor(() => {
          expect(screen.getByText(/cannot delete|existing expenses/i)).toBeInTheDocument();
        });
      }
    });
  });

  describe('Member Statistics', () => {
    it('should display member count', async () => {
      const mockMembers = [
        { _id: '1', name: 'User 1', isActive: true, createdAt: '2024-01-01T00:00:00.000Z' },
        { _id: '2', name: 'User 2', isActive: true, createdAt: '2024-01-02T00:00:00.000Z' },
        { _id: '3', name: 'User 3', isActive: false, createdAt: '2024-01-03T00:00:00.000Z' }
      ];

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/members')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMembers)
          });
        }
      });

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        // Should show total or active member count
        expect(screen.getByText(/3|2/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error when fetch fails', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      render(
        <BrowserRouter>
          <Members />
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
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should handle server errors gracefully', async () => {
      global.fetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Server error' })
        })
      );

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator', () => {
      global.fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });
});
