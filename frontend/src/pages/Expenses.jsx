import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { membersAPI, expensesAPI } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useToast } from '../components/ui/use-toast';
import { ArrowLeft, Plus, Receipt, Trash2, Search, Download, Filter } from 'lucide-react';

export default function Expenses() {
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    paidBy: '',
    date: new Date().toISOString().split('T')[0],
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchMembers();
    fetchExpenses();
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await membersAPI.getAll();
      setMembers(response.data);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchExpenses = async () => {
    try {
      const response = await expensesAPI.getAll();
      // Handle both old and new pagination format
      const expenseData = response.data.expenses || response.data;
      setExpenses(expenseData);
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to fetch expenses',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.amount || !formData.paidBy) {
      toast({
        title: 'Error',
        description: 'Please fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await expensesAPI.create(formData);
      toast({
        title: 'Success',
        description: 'Expense added successfully',
      });
      setFormData({
        title: '',
        amount: '',
        paidBy: '',
        date: new Date().toISOString().split('T')[0],
      });
      fetchExpenses();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add expense',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteExpense = async (id, title) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      await expensesAPI.delete(id);
      toast({
        title: 'Success',
        description: 'Expense deleted successfully',
      });
      fetchExpenses();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete expense',
        variant: 'destructive',
      });
    }
  };

  // Filter expenses based on search and date filter
  const getFilteredExpenses = () => {
    let filtered = [...expenses];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((expense) =>
        expense.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.paidBy?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter((expense) => {
        const expenseDate = new Date(expense.date);

        switch (dateFilter) {
          case 'today':
            return expenseDate >= today;
          case 'week': {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return expenseDate >= weekAgo;
          }
          case 'month': {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return expenseDate >= monthAgo;
          }
          default:
            return true;
        }
      });
    }

    return filtered;
  };

  // Export to CSV
  const handleExportCSV = () => {
    const filtered = getFilteredExpenses();

    if (filtered.length === 0) {
      toast({
        title: 'No data',
        description: 'No expenses to export',
        variant: 'destructive',
      });
      return;
    }

    // Create CSV content
    const headers = ['Date', 'Title', 'Amount', 'Paid By'];
    const rows = filtered.map((expense) => [
      formatDate(expense.date),
      expense.title,
      expense.amount,
      expense.paidBy?.name || 'Unknown',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `costsplit-expenses-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Success',
      description: 'Expenses exported successfully',
    });
  };

  const filteredExpenses = getFilteredExpenses();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-6">
      <div className="container mx-auto px-3 py-4 sm:p-6 max-w-4xl">
        {/* Mobile-Optimized Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold">Expenses</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Track and manage expenses</p>
            </div>
          </div>
        </div>

        {/* Mobile-Optimized Add Expense Form */}
        <Card className="mb-4 sm:mb-6 shadow-sm">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add New Expense
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Lunch at KFC"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    disabled={isLoading}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm">Amount (৳)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    disabled={isLoading}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paidBy" className="text-sm">Paid By</Label>
                  <Select
                    value={formData.paidBy}
                    onValueChange={(value) => setFormData({ ...formData, paidBy: value })}
                    disabled={isLoading || members.length === 0}
                  >
                    <SelectTrigger className="h-11 sm:h-10 text-base">
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member._id} value={member._id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-sm">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    disabled={isLoading}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading || members.length === 0}
                className="h-11 sm:h-10 w-full sm:w-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="text-base sm:text-sm">Add Expense</span>
              </Button>
              {members.length === 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Please add members first before creating expenses.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Mobile-Optimized Search and Filter */}
        {expenses.length > 0 && (
          <Card className="mb-4 sm:mb-6 shadow-sm">
            <CardContent className="p-4 sm:pt-6 sm:px-6 sm:pb-6">
              <div className="flex flex-col gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search by title or member..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 h-11 sm:h-10 text-base"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="flex-1 sm:flex-none sm:w-[150px] h-11 sm:h-10">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={handleExportCSV} className="h-11 sm:h-10">
                    <Download className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </Button>
                </div>
              </div>
              {(searchQuery || dateFilter !== 'all') && (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <span>Showing {filteredExpenses.length} of {expenses.length} expenses</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setDateFilter('all');
                    }}
                    className="h-8 w-fit"
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mobile-Optimized Expenses List */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Expense History ({filteredExpenses.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {filteredExpenses.length === 0 && expenses.length > 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <Receipt className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-base">No expenses match your filters</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setDateFilter('all');
                  }}
                  className="mt-2 text-xs sm:text-sm"
                >
                  Clear filters
                </Button>
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <Receipt className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-base">No expenses yet. Add your first expense above!</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {filteredExpenses.map((expense) => (
                  <div
                    key={expense._id}
                    className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-green-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm sm:text-base truncate">{expense.title}</h3>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">
                            Paid by {expense.paidBy.name} • {formatDate(expense.date)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 ml-2 flex-shrink-0">
                      <span className="text-base sm:text-lg font-bold text-green-600">
                        {formatCurrency(expense.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteExpense(expense._id, expense.title)}
                        className="h-9 w-9 sm:h-10 sm:w-10"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
