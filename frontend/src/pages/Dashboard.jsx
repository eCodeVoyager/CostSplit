import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { membersAPI, expensesAPI } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Wallet, Users, Receipt, Scale, LogOut, TrendingUp, Clock, Plus } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalExpenses: 0,
    totalAmount: 0,
  });
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [membersRes, expensesRes, recentExpensesRes] = await Promise.all([
        membersAPI.getCount(),
        expensesAPI.getStats(),
        expensesAPI.getAll({ limit: 5 }),
      ]);

      setStats({
        totalMembers: membersRes.data.count,
        totalExpenses: expensesRes.data.totalExpenses,
        totalAmount: expensesRes.data.totalAmount,
      });

      // Handle pagination response format
      const expenseData = recentExpensesRes.data.expenses || recentExpensesRes.data;
      setRecentExpenses(expenseData);

      // Fetch members for preview
      const membersListRes = await membersAPI.getAll();
      setMembers(membersListRes.data.slice(0, 5)); // Show first 5
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const averageExpense = stats.totalExpenses > 0
    ? stats.totalAmount / stats.totalExpenses
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">CostSplit</h1>
              <p className="text-sm text-muted-foreground">Shared Expense Manager</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <Button onClick={() => navigate('/expenses')} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Expense
          </Button>
          <Button onClick={() => navigate('/members')} variant="outline" size="sm">
            <Users className="w-4 h-4 mr-2" />
            Add Member
          </Button>
          <Button onClick={() => navigate('/balances')} variant="outline" size="sm">
            <Scale className="w-4 h-4 mr-2" />
            View Balances
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMembers}</div>
              <p className="text-xs text-muted-foreground">Active members</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalExpenses}</div>
              <p className="text-xs text-muted-foreground">Recorded transactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
              <Scale className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
              <p className="text-xs text-muted-foreground">Total spending</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Expense</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(averageExpense)}</div>
              <p className="text-xs text-muted-foreground">Per transaction</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Recent Expenses */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Recent Expenses
                  </CardTitle>
                  <CardDescription>Last 5 transactions</CardDescription>
                </div>
                <Link to="/expenses">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : recentExpenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No expenses yet</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => navigate('/expenses')}
                    className="mt-2"
                  >
                    Add your first expense
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentExpenses.map((expense) => (
                    <div
                      key={expense._id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-8 h-8 bg-green-200 rounded-lg flex items-center justify-center">
                          <Receipt className="w-4 h-4 text-green-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{expense.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {expense.paidBy?.name || 'Unknown'} • {formatDate(expense.date)}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-green-600 ml-2">
                        {formatCurrency(expense.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members Preview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Members
                  </CardTitle>
                  <CardDescription>Group members</CardDescription>
                </div>
                <Link to="/members">
                  <Button variant="ghost" size="sm">Manage</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No members yet</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => navigate('/members')}
                    className="mt-2"
                  >
                    Add members
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member._id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold text-blue-700">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium">{member.name}</span>
                    </div>
                  ))}
                  {stats.totalMembers > 5 && (
                    <div className="text-center pt-2">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => navigate('/members')}
                      >
                        +{stats.totalMembers - 5} more
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link to="/members">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle>Members</CardTitle>
                    <CardDescription>Manage group members</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/expenses">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>Expenses</CardTitle>
                    <CardDescription>Track and add expenses</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/balances">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Scale className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle>Balances</CardTitle>
                    <CardDescription>View balances and settlements</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
