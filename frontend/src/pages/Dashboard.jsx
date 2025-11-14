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

      const expenseData = recentExpensesRes.data.expenses || recentExpensesRes.data;
      setRecentExpenses(expenseData);

      const membersListRes = await membersAPI.getAll();
      setMembers(membersListRes.data.slice(0, 5));
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-6">
      <div className="container mx-auto px-3 py-4 sm:p-6 max-w-7xl">
        {/* Mobile-Optimized Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">CostSplit</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Shared Expense Manager</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} size="sm" className="h-9">
            <LogOut className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>

        {/* Mobile-Optimized Quick Actions */}
        <div className="grid grid-cols-3 gap-2 mb-4 sm:flex sm:gap-3 sm:mb-6">
          <Button onClick={() => navigate('/expenses')} size="sm" className="h-11 flex-col sm:flex-row gap-1 sm:gap-2">
            <Plus className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Add Expense</span>
          </Button>
          <Button onClick={() => navigate('/members')} variant="outline" size="sm" className="h-11 flex-col sm:flex-row gap-1 sm:gap-2">
            <Users className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Add Member</span>
          </Button>
          <Button onClick={() => navigate('/balances')} variant="outline" size="sm" className="h-11 flex-col sm:flex-row gap-1 sm:gap-2">
            <Scale className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Balances</span>
          </Button>
        </div>

        {/* Mobile-Optimized Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-8">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Members</CardTitle>
              <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.totalMembers}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">Active members</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Expenses</CardTitle>
              <Receipt className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.totalExpenses}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">Transactions</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Total</CardTitle>
              <Scale className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">Total spending</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Average</CardTitle>
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(averageExpense)}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">Per transaction</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-4 sm:mb-8">
          {/* Recent Expenses - Full Width on Mobile */}
          <Card className="shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                    Recent
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Last 5 transactions</CardDescription>
                </div>
                <Link to="/expenses">
                  <Button variant="ghost" size="sm" className="h-8 text-xs sm:text-sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
              ) : recentExpenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No expenses yet</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => navigate('/expenses')}
                    className="mt-2 text-xs"
                  >
                    Add your first expense
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {recentExpenses.map((expense) => (
                    <div
                      key={expense._id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors active:bg-slate-200"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-green-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-4 h-4 text-green-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm sm:text-base">{expense.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {expense.paidBy?.name || 'Unknown'} • {formatDate(expense.date)}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm sm:text-base font-bold text-green-600 ml-2 flex-shrink-0">
                        {formatCurrency(expense.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members - Full Width on Mobile, shows under recent expenses */}
          <Card className="shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                    Members
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Group members</CardDescription>
                </div>
                <Link to="/members">
                  <Button variant="ghost" size="sm" className="h-8 text-xs sm:text-sm">Manage</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
              ) : members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No members yet</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => navigate('/members')}
                    className="mt-2 text-xs"
                  >
                    Add members
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {members.map((member) => (
                    <div
                      key={member._id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors active:bg-slate-100"
                    >
                      <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-blue-700">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium truncate">{member.name}</span>
                    </div>
                  ))}
                  {stats.totalMembers > 5 && (
                    <div className="col-span-2 sm:col-span-3 text-center pt-2">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => navigate('/members')}
                        className="text-xs"
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

        {/* Mobile-Optimized Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
          <Link to="/members" className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
              <CardHeader className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg">Members</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Manage group</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/expenses" className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
              <CardHeader className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg">Expenses</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Track expenses</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/balances" className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
              <CardHeader className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg">Balances</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">View settlements</CardDescription>
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
