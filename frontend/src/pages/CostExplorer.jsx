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
  Calculator,
  Info,
  ChevronDown,
  ChevronUp,
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
  const [showCalculationGuide, setShowCalculationGuide] = useState(false);
  const [expandedExpense, setExpandedExpense] = useState(null);
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

        {/* Calculation Guide */}
        {analytics && (
          <Card className="mb-6 smooth-card border-primary/20">
            <CardHeader className="p-4 sm:p-6">
              <button
                onClick={() => setShowCalculationGuide(!showCalculationGuide)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg sm:text-xl">
                      How Calculations Work
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Understand how we calculate balances and breakdowns
                    </CardDescription>
                  </div>
                </div>
                {showCalculationGuide ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {showCalculationGuide && (
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
                {/* Member Balances */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <h4 className="font-semibold flex items-center gap-2 text-primary">
                    <Users className="w-4 h-4" />
                    Member Balance Calculation
                  </h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p><strong className="text-foreground">Total Paid:</strong> Sum of all amounts a member has paid (single or split payments)</p>
                    <p><strong className="text-foreground">Total Owed:</strong> Sum of all amounts a member owes based on:</p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li><strong className="text-foreground">Custom Shares:</strong> Their specific assigned amount</li>
                      <li><strong className="text-foreground">Equal Split:</strong> Total expense ÷ Number of members sharing</li>
                    </ul>
                    <p><strong className="text-foreground">Net Balance:</strong> Total Paid - Total Owed</p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li className="text-green-600 dark:text-green-400">Positive (+): Member should receive money</li>
                      <li className="text-red-600 dark:text-red-400">Negative (-): Member owes money</li>
                      <li>Zero (0): Member is settled</li>
                    </ul>
                  </div>
                </div>

                {/* Example Calculation */}
                <div className="p-4 bg-primary/5 rounded-lg space-y-3 border border-primary/20">
                  <h4 className="font-semibold flex items-center gap-2 text-primary">
                    <Calculator className="w-4 h-4" />
                    Example: Lunch Expense ৳300
                  </h4>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className="font-semibold text-foreground mb-2">Scenario: 3 people share lunch</p>
                      <div className="space-y-1 text-muted-foreground">
                        <p>• <strong className="text-foreground">Alice</strong> pays ৳300</p>
                        <p>• Shared by: <strong className="text-foreground">Alice, Bob, Charlie</strong></p>
                        <p>• Each person's share: ৳300 ÷ 3 = <strong className="text-primary">৳100</strong></p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <div className="p-2 bg-card rounded border">
                        <p className="font-semibold text-foreground">Alice</p>
                        <p className="text-xs text-muted-foreground">Paid: ৳300</p>
                        <p className="text-xs text-muted-foreground">Owes: ৳100</p>
                        <p className="text-xs font-bold text-green-600">Balance: +৳200</p>
                      </div>
                      <div className="p-2 bg-card rounded border">
                        <p className="font-semibold text-foreground">Bob</p>
                        <p className="text-xs text-muted-foreground">Paid: ৳0</p>
                        <p className="text-xs text-muted-foreground">Owes: ৳100</p>
                        <p className="text-xs font-bold text-red-600">Balance: -৳100</p>
                      </div>
                      <div className="p-2 bg-card rounded border">
                        <p className="font-semibold text-foreground">Charlie</p>
                        <p className="text-xs text-muted-foreground">Paid: ৳0</p>
                        <p className="text-xs text-muted-foreground">Owes: ৳100</p>
                        <p className="text-xs font-bold text-red-600">Balance: -৳100</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category Detection */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <h4 className="font-semibold flex items-center gap-2 text-primary">
                    <Tag className="w-4 h-4" />
                    Category Auto-Detection
                  </h4>
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2 text-foreground">Categories are automatically detected based on expense title keywords:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <p><strong className="text-blue-600">Transportation:</strong> bus, rickshaw, uber, taxi, etc.</p>
                        <p><strong className="text-orange-600">Food & Drinks:</strong> lunch, dinner, breakfast, tea, etc.</p>
                        <p><strong className="text-purple-600">Shopping:</strong> shopping, groceries, store, etc.</p>
                      </div>
                      <div>
                        <p><strong className="text-red-600">Bills:</strong> bill, utility, rent, electricity, etc.</p>
                        <p><strong className="text-green-600">Entertainment:</strong> movie, game, party, etc.</p>
                        <p><strong className="text-muted-foreground">Other:</strong> Everything else</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Time Breakdown */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <h4 className="font-semibold flex items-center gap-2 text-primary">
                    <Calendar className="w-4 h-4" />
                    Time Period Breakdown
                  </h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p><strong className="text-foreground">Daily:</strong> Shows up to last 30 days of expenses</p>
                    <p><strong className="text-foreground">Weekly:</strong> Groups by week start date (Sunday), shows last 12 weeks</p>
                    <p><strong className="text-foreground">Monthly:</strong> Groups by month (YYYY-MM), shows last 12 months</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    All calculations are rounded to 2 decimal places. Custom shares must equal the total expense amount.
                    When expenses are split equally, any rounding difference is added to the first member.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
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
              <div className="space-y-2">
                {analytics.recentExpenses.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No expenses found
                  </div>
                ) : (
                  analytics.recentExpenses.map((expense) => {
                    const isExpanded = expandedExpense === expense.id;
                    const sharePerPerson = expense.customShares
                      ? null
                      : expense.amount / expense.sharedBy.length;

                    return (
                      <div key={expense.id} className="border rounded-lg overflow-hidden">
                        {/* Main Row - Clickable */}
                        <button
                          onClick={() => setExpandedExpense(isExpanded ? null : expense.id)}
                          className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-2 sm:gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Date</p>
                              <p className="text-sm font-medium">{formatDate(expense.date)}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs text-muted-foreground">Title</p>
                              <p className="text-sm font-semibold">{expense.title}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Amount</p>
                              <p className="text-sm font-bold text-primary">
                                {formatCurrency(expense.amount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Paid By</p>
                              <p className="text-sm">
                                {expense.paidBy.length === 1
                                  ? expense.paidBy[0].name
                                  : `${expense.paidBy.length} people`}
                              </p>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          )}
                        </button>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="p-4 pt-0 space-y-4 bg-muted/30">
                            {/* Payment Breakdown */}
                            <div className="p-3 bg-card rounded-lg border">
                              <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-green-600" />
                                Who Paid
                              </h5>
                              <div className="space-y-1">
                                {expense.paidBy.map((p, i) => (
                                  <div key={i} className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{p.name}</span>
                                    <span className="font-semibold text-green-600">
                                      {formatCurrency(p.amount)}
                                    </span>
                                  </div>
                                ))}
                                {expense.paidBy.length > 1 && (
                                  <div className="flex justify-between text-sm pt-2 border-t">
                                    <span className="font-semibold">Total Paid</span>
                                    <span className="font-bold text-green-600">
                                      {formatCurrency(expense.amount)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Cost Sharing Breakdown */}
                            <div className="p-3 bg-card rounded-lg border">
                              <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <Users className="w-4 h-4 text-orange-600" />
                                Cost Sharing
                                {expense.customShares && (
                                  <span className="text-xs text-violet-600 dark:text-violet-400 font-normal">
                                    (Custom Shares)
                                  </span>
                                )}
                              </h5>
                              <div className="space-y-1">
                                {expense.customShares ? (
                                  // Custom shares - show each person's specific amount
                                  <>
                                    {expense.customShares.map((s, i) => (
                                      <div key={i} className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">{s.name}</span>
                                        <span className="font-semibold text-orange-600">
                                          {formatCurrency(s.amount)}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between text-sm pt-2 border-t">
                                      <span className="font-semibold">Total Cost</span>
                                      <span className="font-bold text-orange-600">
                                        {formatCurrency(expense.amount)}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  // Equal split - show calculation
                                  <>
                                    <div className="text-xs text-muted-foreground mb-2 p-2 bg-muted/50 rounded">
                                      {formatCurrency(expense.amount)} ÷ {expense.sharedBy.length} people = {formatCurrency(sharePerPerson)} each
                                    </div>
                                    {expense.sharedBy.map((name, i) => (
                                      <div key={i} className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">{name}</span>
                                        <span className="font-semibold text-orange-600">
                                          {formatCurrency(sharePerPerson)}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between text-sm pt-2 border-t">
                                      <span className="font-semibold">Total Cost</span>
                                      <span className="font-bold text-orange-600">
                                        {formatCurrency(expense.amount)}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Individual Balance Impact */}
                            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                              <h5 className="font-semibold text-sm mb-2 flex items-center gap-2 text-primary">
                                <Info className="w-4 h-4" />
                                Balance Impact
                              </h5>
                              <div className="space-y-1">
                                {/* Calculate and show each member's balance change */}
                                {analytics.memberBreakdown
                                  .filter((member) => {
                                    // Show members who either paid or owe for this expense
                                    const paid = expense.paidBy.find(p => p.name === member.memberName);
                                    const owes = expense.customShares
                                      ? expense.customShares.find(s => s.name === member.memberName)
                                      : expense.sharedBy.includes(member.memberName);
                                    return paid || owes;
                                  })
                                  .map((member) => {
                                    const paidAmount = expense.paidBy.find(p => p.name === member.memberName)?.amount || 0;
                                    const owedAmount = expense.customShares
                                      ? expense.customShares.find(s => s.name === member.memberName)?.amount || 0
                                      : expense.sharedBy.includes(member.memberName) ? sharePerPerson : 0;
                                    const impact = paidAmount - owedAmount;

                                    return (
                                      <div key={member.memberId} className="flex justify-between text-sm">
                                        <span className="text-foreground">{member.memberName}</span>
                                        <span className={`font-semibold ${
                                          impact > 0 ? 'text-green-600' : impact < 0 ? 'text-red-600' : 'text-muted-foreground'
                                        }`}>
                                          {impact > 0 && '+'}{formatCurrency(impact)}
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                              <div className="text-xs text-muted-foreground mt-3 pt-2 border-t">
                                Positive = receives money • Negative = owes money
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
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
