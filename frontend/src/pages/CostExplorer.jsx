import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { expensesAPI, membersAPI } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useToast } from "../components/ui/use-toast";
import {
  ArrowLeft,
  BarChart3,
  Table as TableIcon,
  TrendingUp,
  Users,
  Calendar,
  Tag,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const COLORS = {
  transportation: "#3B82F6", // Blue
  food: "#F97316", // Orange
  shopping: "#8B5CF6", // Purple
  bills: "#EF4444", // Red
  entertainment: "#10B981", // Green
  other: "#6B7280", // Gray
};

const CATEGORY_LABELS = {
  transportation: "Transportation",
  food: "Food & Drinks",
  shopping: "Shopping",
  bills: "Bills & Utilities",
  entertainment: "Entertainment",
  other: "Other",
};

export default function CostExplorer() {
  const [viewMode, setViewMode] = useState("graphs"); // "graphs" or "table"
  const [analytics, setAnalytics] = useState(null);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedMember, setSelectedMember] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [timeView, setTimeView] = useState("monthly"); // "daily", "weekly", "monthly"
  const { toast } = useToast();

  useEffect(() => {
    fetchMembers();
    fetchAnalytics();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [dateFilter, startDate, endDate, selectedMember, currentPage]);

  const fetchMembers = async () => {
    try {
      const response = await membersAPI.getAll();
      setMembers(response.data);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: 20,
      };

      // Date filtering
      if (dateFilter === "custom" && (startDate || endDate)) {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      } else if (dateFilter !== "all") {
        const end = new Date();
        const start = new Date();

        if (dateFilter === "today") {
          start.setHours(0, 0, 0, 0);
        } else if (dateFilter === "week") {
          start.setDate(start.getDate() - 7);
        } else if (dateFilter === "month") {
          start.setMonth(start.getMonth() - 1);
        } else if (dateFilter === "3months") {
          start.setMonth(start.getMonth() - 3);
        } else if (dateFilter === "year") {
          start.setFullYear(start.getFullYear() - 1);
        }

        params.startDate = start.toISOString().split("T")[0];
        params.endDate = end.toISOString().split("T")[0];
      }

      // Member filtering
      if (selectedMember && selectedMember !== "all") {
        params.memberId = selectedMember;
      }

      const response = await expensesAPI.getAnalytics(params);
      setAnalytics(response.data);
    } catch (error) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch analytics",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!analytics || !analytics.recentExpenses || analytics.recentExpenses.length === 0) {
      toast({
        title: "No data",
        description: "No expenses to export",
        variant: "destructive",
      });
      return;
    }

    // Create CSV content
    const headers = ["Date", "Title", "Amount", "Paid By", "Category"];
    const rows = analytics.recentExpenses.map((expense) => {
      const category = Object.keys(CATEGORY_LABELS).find(cat =>
        analytics.categoryBreakdown[cat]?.expenses?.some(e => e.id === expense.id)
      ) || 'other';

      return [
        formatDate(expense.date),
        expense.title,
        expense.amount,
        expense.paidBy.map(p => `${p.name} (৳${p.amount})`).join("; "),
        CATEGORY_LABELS[category],
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `cost-explorer-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Success",
      description: "Data exported successfully",
    });
  };

  const getCategoryChartData = () => {
    if (!analytics || !analytics.categoryBreakdown) return [];
    return Object.entries(analytics.categoryBreakdown)
      .filter(([_, data]) => data.total > 0)
      .map(([category, data]) => ({
        name: CATEGORY_LABELS[category] || category,
        value: data.total,
        count: data.count,
        fill: COLORS[category] || COLORS.other,
      }))
      .sort((a, b) => b.value - a.value);
  };

  const getMemberChartData = () => {
    if (!analytics || !analytics.memberBreakdown) return [];
    return analytics.memberBreakdown
      .filter(member => member.totalPaid > 0 || member.totalOwed > 0)
      .map((member, index) => ({
        name: member.memberName,
        paid: member.totalPaid,
        owed: member.totalOwed,
        balance: member.netBalance,
      }))
      .sort((a, b) => b.paid - a.paid);
  };

  const getTimeChartData = () => {
    if (!analytics || !analytics.timeBreakdown) return [];

    const data = timeView === "daily"
      ? analytics.timeBreakdown.daily
      : timeView === "weekly"
      ? analytics.timeBreakdown.weekly
      : analytics.timeBreakdown.monthly;

    return data.map(item => ({
      date: item.date || item.weekStart || item.month,
      amount: item.total,
      count: item.count,
    })).reverse();
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-sm mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading && !analytics) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="container mx-auto px-3 py-4 sm:p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard">
            <Button
              variant="outline"
              size="icon"
              className="soft-button"
              aria-label="Go back to dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/70 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Cost Explorer</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Comprehensive cost analysis and breakdowns
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6 smooth-card">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
              {(dateFilter !== "all" || selectedMember !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFilter("all");
                    setStartDate("");
                    setEndDate("");
                    setSelectedMember("all");
                    setCurrentPage(1);
                  }}
                  className="text-xs"
                >
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Date Filter */}
              <div className="space-y-2">
                <Label className="text-sm">Time Period</Label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="h-11 sm:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                    <SelectItem value="3months">Last 3 Months</SelectItem>
                    <SelectItem value="year">Last Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Member Filter */}
              <div className="space-y-2">
                <Label className="text-sm">Member</Label>
                <Select value={selectedMember} onValueChange={setSelectedMember}>
                  <SelectTrigger className="h-11 sm:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member._id} value={member._id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* View Mode Toggle */}
              <div className="space-y-2">
                <Label className="text-sm">View Mode</Label>
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === "graphs" ? "default" : "outline"}
                    className="flex-1 h-11 sm:h-10"
                    onClick={() => setViewMode("graphs")}
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Graphs
                  </Button>
                  <Button
                    variant={viewMode === "table" ? "default" : "outline"}
                    className="flex-1 h-11 sm:h-10"
                    onClick={() => setViewMode("table")}
                  >
                    <TableIcon className="w-4 h-4 mr-2" />
                    Table
                  </Button>
                </div>
              </div>
            </div>

            {/* Custom Date Range */}
            {dateFilter === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-sm">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 sm:h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-11 sm:h-10"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Stats */}
        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card className="smooth-card">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Expenses</p>
                    <p className="text-2xl font-bold">{analytics.summary.totalExpenses}</p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="smooth-card">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(analytics.summary.totalAmount)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="smooth-card">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Average Expense</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(analytics.summary.averageExpense)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Tag className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Graph View */}
        {viewMode === "graphs" && analytics && (
          <div className="space-y-6">
            {/* Category Breakdown */}
            <Card className="smooth-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl">
                  Spending by Category
                </CardTitle>
                <CardDescription>
                  Breakdown of expenses across different categories
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Pie Chart */}
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getCategoryChartData()}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                          labelLine={false}
                        >
                          {getCategoryChartData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Bar Chart */}
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getCategoryChartData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" name="Amount">
                          {getCategoryChartData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Category Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
                  {Object.entries(analytics.categoryBreakdown)
                    .filter(([_, data]) => data.total > 0)
                    .sort(([_, a], [__, b]) => b.total - a.total)
                    .map(([category, data]) => (
                      <div
                        key={category}
                        className="p-4 rounded-lg border hover:border-primary transition-colors"
                        style={{ borderLeftWidth: '4px', borderLeftColor: COLORS[category] }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-sm">{CATEGORY_LABELS[category]}</p>
                          <span className="text-xs text-muted-foreground">{data.count} items</span>
                        </div>
                        <p className="text-xl font-bold">{formatCurrency(data.total)}</p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Member Breakdown */}
            <Card className="smooth-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl">
                  Member Analysis
                </CardTitle>
                <CardDescription>
                  Paid vs Owed comparison for each member
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="h-80 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getMemberChartData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="paid" name="Total Paid" fill="#10B981" />
                      <Bar dataKey="owed" name="Total Owed" fill="#F97316" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Member Details Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-sm text-muted-foreground">
                        <th className="text-left py-3 px-2">Member</th>
                        <th className="text-right py-3 px-2">Paid</th>
                        <th className="text-right py-3 px-2">Owed</th>
                        <th className="text-right py-3 px-2">Balance</th>
                        <th className="text-right py-3 px-2">Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.memberBreakdown.map((member) => (
                        <tr key={member.memberId} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2 font-medium">{member.memberName}</td>
                          <td className="text-right py-3 px-2 text-green-600">
                            {formatCurrency(member.totalPaid)}
                          </td>
                          <td className="text-right py-3 px-2 text-orange-600">
                            {formatCurrency(member.totalOwed)}
                          </td>
                          <td className={`text-right py-3 px-2 font-bold ${
                            member.netBalance > 0 ? 'text-green-600' :
                            member.netBalance < 0 ? 'text-red-600' : 'text-muted-foreground'
                          }`}>
                            {formatCurrency(member.netBalance)}
                          </td>
                          <td className="text-right py-3 px-2 text-muted-foreground">
                            {member.expenseCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Time Trend */}
            <Card className="smooth-card">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">
                      Spending Trend
                    </CardTitle>
                    <CardDescription>
                      Track spending over time
                    </CardDescription>
                  </div>
                  <Select value={timeView} onValueChange={setTimeView}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getTimeChartData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        name="Amount"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        dot={{ fill: '#3B82F6', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Expenses */}
            <Card className="smooth-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl">
                  Top 10 Expenses
                </CardTitle>
                <CardDescription>
                  Largest expenses in this period
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="space-y-3">
                  {analytics.topExpenses.map((expense, index) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary">#{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{expense.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(expense.date)} • {expense.paidBy}
                          </p>
                        </div>
                      </div>
                      <p className="text-lg font-bold ml-2">{formatCurrency(expense.amount)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Table View */}
        {viewMode === "table" && analytics && (
          <Card className="smooth-card">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg sm:text-xl">
                    Expense Details
                  </CardTitle>
                  <CardDescription>
                    All expenses with full breakdown
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="soft-button"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr className="text-sm text-muted-foreground">
                      <th className="text-left py-3 px-2">Date</th>
                      <th className="text-left py-3 px-2">Title</th>
                      <th className="text-right py-3 px-2">Amount</th>
                      <th className="text-left py-3 px-2">Paid By</th>
                      <th className="text-left py-3 px-2">Shared By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentExpenses.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-12 text-muted-foreground">
                          No expenses found
                        </td>
                      </tr>
                    ) : (
                      analytics.recentExpenses.map((expense) => (
                        <tr key={expense.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2 text-sm">
                            {formatDate(expense.date)}
                          </td>
                          <td className="py-3 px-2 font-medium">{expense.title}</td>
                          <td className="text-right py-3 px-2 font-bold">
                            {formatCurrency(expense.amount)}
                          </td>
                          <td className="py-3 px-2 text-sm">
                            {expense.paidBy.map((p, i) => (
                              <div key={i}>
                                {p.name} {expense.paidBy.length > 1 && `(${formatCurrency(p.amount)})`}
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-2 text-sm text-muted-foreground">
                            {expense.customShares
                              ? expense.customShares.map((s, i) => (
                                  <div key={i}>
                                    {s.name} ({formatCurrency(s.amount)})
                                  </div>
                                ))
                              : expense.sharedBy.join(", ")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {analytics.pagination.pages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {analytics.pagination.page} of {analytics.pagination.pages}
                    {" • "}
                    {analytics.pagination.total} total expenses
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(analytics.pagination.pages, currentPage + 1))}
                      disabled={currentPage === analytics.pagination.pages}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
