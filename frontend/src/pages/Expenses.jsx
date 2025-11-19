import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { membersAPI, expensesAPI } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { useToast } from "../components/ui/use-toast";
import {
  ArrowLeft,
  Plus,
  Receipt,
  Trash2,
  Search,
  Download,
  Filter,
  Zap,
  Bus,
  UtensilsCrossed,
  ShoppingBag,
  Users2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// Preset expense templates for quick adding
const EXPENSE_TEMPLATES = {
  transport: [
    { title: "Bus Fair UP", amount: "50", icon: "🚌" },
    { title: "Bus Fair DOWN", amount: "50", icon: "🚌" },
    { title: "Rickshaw", amount: "30", icon: "🛺" },
    { title: "CNG/Auto", amount: "100", icon: "🚕" },
    { title: "Uber/Pathao", amount: "150", icon: "🚗" },
  ],
  food: [
    { title: "Breakfast", amount: "80", icon: "🍳" },
    { title: "Lunch", amount: "150", icon: "🍱" },
    { title: "Dinner", amount: "200", icon: "🍽️" },
    { title: "Snacks", amount: "50", icon: "🍿" },
    { title: "Tea/Coffee", amount: "30", icon: "☕" },
  ],
  other: [
    { title: "Shopping", amount: "500", icon: "🛍️" },
    { title: "Movie", amount: "300", icon: "🎬" },
    { title: "Bills", amount: "200", icon: "💳" },
    { title: "Groceries", amount: "800", icon: "🛒" },
  ],
};

export default function Expenses() {
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [isCustomShares, setIsCustomShares] = useState(false);
  const [splitPayers, setSplitPayers] = useState([]);
  const [customShares, setCustomShares] = useState([]);
  const [sharedByMembers, setSharedByMembers] = useState([]);
  const [showSharedBySection, setShowSharedBySection] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    paidBy: "",
    date: new Date().toISOString().split("T")[0],
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchMembers();
    fetchExpenses();
  }, []);

  // Refetch expenses when date filter or custom dates change
  useEffect(() => {
    if (dateFilter === "custom") {
      fetchExpenses();
    }
  }, [startDate, endDate, dateFilter]);

  const fetchMembers = async () => {
    try {
      const response = await membersAPI.getAll();
      const fetchedMembers = response.data;
      setMembers(fetchedMembers);

      // Initialize sharedByMembers with all members selected by default
      setSharedByMembers(
        fetchedMembers.map((m) => ({
          id: m._id,
          name: m.name,
          selected: true,
        }))
      );
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const fetchExpenses = async () => {
    try {
      // Build query parameters for date filtering and sorting
      const params = {
        sortBy: "createdAt", // Sort by most recently created
      };

      // Add date range if custom dates are selected
      if (dateFilter === "custom" && (startDate || endDate)) {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }

      const response = await expensesAPI.getAll(params);
      // Handle both old and new pagination format
      const expenseData = response.data.expenses || response.data;
      setExpenses(expenseData);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to fetch expenses",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation for single payment
    if (!isSplitPayment) {
      if (!formData.title || !formData.amount || !formData.paidBy) {
        toast({
          title: "Error",
          description: "Please fill all required fields",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Validation for split payment
      if (!formData.title || !formData.amount) {
        toast({
          title: "Error",
          description: "Please enter title and total amount",
          variant: "destructive",
        });
        return;
      }

      const selectedPayers = splitPayers.filter(
        (p) => p.selected && parseFloat(p.amount || 0) > 0
      );
      if (selectedPayers.length === 0) {
        toast({
          title: "Error",
          description: "Please select at least one payer with a valid amount",
          variant: "destructive",
        });
        return;
      }

      const totalPaid = selectedPayers.reduce(
        (sum, p) => sum + parseFloat(p.amount || 0),
        0
      );
      const totalAmount = parseFloat(formData.amount);

      // Check for negative amounts
      const hasNegativeAmount = selectedPayers.some(
        (p) => parseFloat(p.amount) < 0
      );
      if (hasNegativeAmount) {
        toast({
          title: "Error",
          description: "Amount cannot be negative",
          variant: "destructive",
        });
        return;
      }

      if (Math.abs(totalPaid - totalAmount) > 0.01) {
        toast({
          title: "Error",
          description: `Total paid (৳${totalPaid.toFixed(
            2
          )}) must equal expense amount (৳${totalAmount})`,
          variant: "destructive",
        });
        return;
      }
    }

    // Validation for custom shares
    if (isCustomShares) {
      const selectedShares = customShares.filter(
        (s) => s.selected && parseFloat(s.amount || 0) > 0
      );
      if (selectedShares.length === 0) {
        toast({
          title: "Error",
          description:
            "Please select at least one member with a valid cost share",
          variant: "destructive",
        });
        return;
      }

      const totalShares = selectedShares.reduce(
        (sum, s) => sum + parseFloat(s.amount || 0),
        0
      );
      const totalAmount = parseFloat(formData.amount);

      if (Math.abs(totalShares - totalAmount) > 0.01) {
        toast({
          title: "Error",
          description: `Total cost shares (৳${totalShares.toFixed(
            2
          )}) must equal expense amount (৳${totalAmount})`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsLoading(true);
    try {
      const expensePayload = {
        title: formData.title,
        amount: parseFloat(formData.amount),
        date: formData.date,
      };

      // Add payer(s)
      if (isSplitPayment) {
        const selectedPayers = splitPayers.filter(
          (p) => p.selected && parseFloat(p.amount) > 0
        );
        expensePayload.payers = selectedPayers.map((payer) => ({
          member: payer.id,
          amount: parseFloat(payer.amount),
        }));
      } else {
        expensePayload.paidBy = formData.paidBy;
      }

      // Add custom shares or sharedBy
      if (isCustomShares) {
        const selectedShares = customShares.filter(
          (s) => s.selected && parseFloat(s.amount) > 0
        );
        expensePayload.customShares = selectedShares.map((share) => ({
          member: share.id,
          amount: parseFloat(share.amount),
        }));
      } else {
        const selectedSharedBy = sharedByMembers
          .filter((m) => m.selected)
          .map((m) => m.id);
        expensePayload.sharedBy = selectedSharedBy;
      }

      await expensesAPI.create(expensePayload);

      toast({
        title: "Success",
        description: "Expense added successfully",
      });

      setFormData({
        title: "",
        amount: "",
        paidBy: "",
        date: new Date().toISOString().split("T")[0],
      });
      setIsSplitPayment(false);
      setIsCustomShares(false);
      setSplitPayers([]);
      setCustomShares([]);
      // Reset sharedByMembers to all selected
      setSharedByMembers(
        members.map((m) => ({
          id: m._id,
          name: m.name,
          selected: true,
        }))
      );
      fetchExpenses();
    } catch (error) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to add expense",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = (template) => {
    setFormData({
      ...formData,
      title: template.title,
      amount: template.amount,
    });
    setShowTemplates(false);
    // Focus on paidBy field if it's empty
    if (!formData.paidBy && !isSplitPayment) {
      setTimeout(() => {
        document.querySelector('[name="paidBy"]')?.focus();
      }, 100);
    }
  };

  const handleSplitPaymentToggle = () => {
    const newSplitMode = !isSplitPayment;
    setIsSplitPayment(newSplitMode);

    if (newSplitMode) {
      // Check if members exist
      if (members.length === 0) {
        toast({
          title: "No members",
          description: "Please add members before using split payment",
          variant: "destructive",
        });
        setIsSplitPayment(false);
        return;
      }

      // Initialize split payers when enabling split mode
      // All members selected by default
      setSplitPayers(
        members.map((member) => ({
          id: member._id,
          name: member.name,
          selected: true,
          amount: "0",
        }))
      );
    } else {
      setSplitPayers([]);
    }
  };

  const handleSplitPayerToggle = (payerId) => {
    setSplitPayers((prev) =>
      prev.map((payer) =>
        payer.id === payerId ? { ...payer, selected: !payer.selected } : payer
      )
    );
  };

  const handleSplitAmountChange = (payerId, amount) => {
    // Store as string to preserve decimal input, but validate it's a valid number
    const numAmount = parseFloat(amount);
    if (amount !== "" && (isNaN(numAmount) || numAmount < 0)) {
      return; // Ignore invalid input
    }

    setSplitPayers((prev) =>
      prev.map((payer) =>
        payer.id === payerId ? { ...payer, amount: amount } : payer
      )
    );
  };

  const handleAutoSplit = () => {
    // Validate total amount is entered
    const totalAmount = parseFloat(formData.amount) || 0;
    if (totalAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid total amount first",
        variant: "destructive",
      });
      return;
    }

    const selectedCount = splitPayers.filter((p) => p.selected).length;
    if (selectedCount === 0) {
      toast({
        title: "No payers selected",
        description: "Please select members first",
        variant: "destructive",
      });
      return;
    }

    // Calculate per-person amount with proper rounding
    const perPerson = (totalAmount / selectedCount).toFixed(2);

    // Handle rounding remainder - add to first selected payer
    const remainder = (
      totalAmount -
      parseFloat(perPerson) * selectedCount
    ).toFixed(2);
    let isFirst = true;

    setSplitPayers((prev) =>
      prev.map((payer) => {
        if (payer.selected) {
          const amount =
            isFirst && parseFloat(remainder) !== 0
              ? (parseFloat(perPerson) + parseFloat(remainder)).toFixed(2)
              : perPerson;
          isFirst = false;
          return { ...payer, amount };
        }
        return payer;
      })
    );
  };

  // Custom shares handlers
  const handleCustomSharesToggle = () => {
    const newCustomMode = !isCustomShares;
    setIsCustomShares(newCustomMode);

    if (newCustomMode) {
      // Check if members exist
      if (members.length === 0) {
        toast({
          title: "No members",
          description: "Please add members before using custom shares",
          variant: "destructive",
        });
        setIsCustomShares(false);
        return;
      }

      // Initialize custom shares when enabling custom mode
      // All members selected by default with 0 amount
      setCustomShares(
        members.map((member) => ({
          id: member._id,
          name: member.name,
          selected: true,
          amount: "0",
        }))
      );
      // Disable sharedBy section when using custom shares
      setShowSharedBySection(false);
    } else {
      setCustomShares([]);
    }
  };

  const handleCustomShareToggle = (memberId) => {
    setCustomShares((prev) =>
      prev.map((share) =>
        share.id === memberId ? { ...share, selected: !share.selected } : share
      )
    );
  };

  const handleCustomShareAmountChange = (memberId, amount) => {
    const numAmount = parseFloat(amount);
    if (amount !== "" && (isNaN(numAmount) || numAmount < 0)) {
      return; // Ignore invalid input
    }

    setCustomShares((prev) =>
      prev.map((share) =>
        share.id === memberId ? { ...share, amount: amount } : share
      )
    );
  };

  const handleAutoSplitShares = () => {
    const totalAmount = parseFloat(formData.amount) || 0;
    if (totalAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid total amount first",
        variant: "destructive",
      });
      return;
    }

    const selectedCount = customShares.filter((s) => s.selected).length;
    if (selectedCount === 0) {
      toast({
        title: "No members selected",
        description: "Please select members first",
        variant: "destructive",
      });
      return;
    }

    // Calculate per-person amount with proper rounding
    const perPerson = (totalAmount / selectedCount).toFixed(2);
    const remainder = (
      totalAmount -
      parseFloat(perPerson) * selectedCount
    ).toFixed(2);
    let isFirst = true;

    setCustomShares((prev) =>
      prev.map((share) => {
        if (share.selected) {
          const amount =
            isFirst && parseFloat(remainder) !== 0
              ? (parseFloat(perPerson) + parseFloat(remainder)).toFixed(2)
              : perPerson;
          isFirst = false;
          return { ...share, amount };
        }
        return share;
      })
    );
  };

  const handleDeleteExpense = async (id, title) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      await expensesAPI.delete(id);
      toast({
        title: "Success",
        description: "Expense deleted successfully",
      });
      fetchExpenses();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete expense",
        variant: "destructive",
      });
    }
  };

  // Filter expenses based on search and date filter
  const getFilteredExpenses = () => {
    let filtered = [...expenses];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (expense) =>
          expense.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          expense.paidBy?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter((expense) => {
        const expenseDate = new Date(expense.date);

        switch (dateFilter) {
          case "today":
            return expenseDate >= today;
          case "week": {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return expenseDate >= weekAgo;
          }
          case "month": {
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
        title: "No data",
        description: "No expenses to export",
        variant: "destructive",
      });
      return;
    }

    // Create CSV content
    const headers = ["Date", "Title", "Amount", "Paid By"];
    const rows = filtered.map((expense) => [
      formatDate(expense.date),
      expense.title,
      expense.amount,
      expense.payers && expense.payers.length > 0
        ? `Split: ${expense.payers
            .map((p) => `${p.member.name} (৳${p.amount})`)
            .join(", ")}`
        : expense.paidBy?.name || "Unknown",
    ]);

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
      `costsplit-expenses-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Success",
      description: "Expenses exported successfully",
    });
  };

  const filteredExpenses = getFilteredExpenses();

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="container mx-auto px-3 py-4 sm:p-6 max-w-4xl">
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
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Expenses</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Track and manage expenses
              </p>
            </div>
          </div>
        </div>

        {/* Quick Expense Templates */}
        <Card className="mb-4 smooth-card bg-muted/30">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                <CardTitle className="text-base sm:text-lg">
                  Quick Add
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplates(!showTemplates)}
                className="soft-button"
              >
                {showTemplates ? "Hide" : "Show"}
              </Button>
            </div>
          </CardHeader>
          {showTemplates && (
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 space-y-3">
              {/* Transportation */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Bus className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700">
                    Transportation
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {EXPENSE_TEMPLATES.transport.map((template, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleTemplateSelect(template)}
                      className="h-auto py-2 px-3 flex flex-col items-start gap-1 soft-button"
                    >
                      <span className="text-base">{template.icon}</span>
                      <span className="text-xs font-medium">
                        {template.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ৳{template.amount}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Food */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <UtensilsCrossed className="w-4 h-4 text-orange-600" />
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700">
                    Food & Drinks
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {EXPENSE_TEMPLATES.food.map((template, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleTemplateSelect(template)}
                      className="h-auto py-2 px-3 flex flex-col items-start gap-1 soft-button"
                    >
                      <span className="text-base">{template.icon}</span>
                      <span className="text-xs font-medium">
                        {template.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ৳{template.amount}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Other */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBag className="w-4 h-4 text-green-600" />
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700">
                    Other
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {EXPENSE_TEMPLATES.other.map((template, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleTemplateSelect(template)}
                      className="h-auto py-2 px-3 flex flex-col items-start gap-1 soft-button"
                    >
                      <span className="text-base">{template.icon}</span>
                      <span className="text-xs font-medium">
                        {template.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ৳{template.amount}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t">
                Click any template to auto-fill the form below
              </p>
            </CardContent>
          )}
        </Card>

        {/* Add Expense Form */}
        <Card className="mb-6 smooth-card">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Plus className="w-5 h-5" />
                Add New Expense
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSplitPaymentToggle}
                  disabled={members.length === 0}
                  className="soft-button"
                >
                  <Users2 className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {isSplitPayment ? "Single" : "Split"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant={isCustomShares ? "default" : "outline"}
                  size="sm"
                  onClick={handleCustomSharesToggle}
                  disabled={members.length === 0}
                  className="soft-button"
                  title="Custom cost per person"
                >
                  <span className="text-xs sm:text-sm">Custom</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm">
                    Title
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Lunch at KFC"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    disabled={isLoading}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm">
                    Total Amount (৳)
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                    disabled={isLoading}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>

                {/* Single Payer Mode */}
                {!isSplitPayment && (
                  <div className="space-y-2">
                    <Label htmlFor="paidBy" className="text-sm">
                      Paid By
                    </Label>
                    <Select
                      value={formData.paidBy}
                      onValueChange={(value) =>
                        setFormData({ ...formData, paidBy: value })
                      }
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
                )}

                <div className="space-y-2">
                  <Label htmlFor="date" className="text-sm">
                    Date
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    disabled={isLoading}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>
              </div>

              {/* Split Payment Mode */}
              {isSplitPayment && (
                <div className="space-y-3 p-3 sm:p-4 bg-muted/30 rounded-lg border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <Label className="text-sm font-semibold">Who paid?</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {splitPayers.filter((p) => p.selected).length} selected
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAutoSplit}
                        className="h-8 text-xs"
                      >
                        Auto Split
                      </Button>
                    </div>
                  </div>

                  {/* Selected Payers - Amount Input */}
                  <div className="space-y-2">
                    {splitPayers
                      .filter((p) => p.selected)
                      .map((payer) => (
                        <div
                          key={payer.id}
                          className="flex items-center gap-2 p-2 sm:p-3 bg-card rounded border"
                        >
                          <span className="flex-1 text-sm font-medium truncate">
                            {payer.name}
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={payer.amount}
                            onChange={(e) =>
                              handleSplitAmountChange(payer.id, e.target.value)
                            }
                            disabled={isLoading}
                            className="w-20 sm:w-24 h-9 sm:h-8 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleSplitPayerToggle(payer.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            title="Remove payer"
                          >
                            <span className="text-lg leading-none">×</span>
                          </button>
                        </div>
                      ))}
                  </div>

                  {/* Unselected Payers - Checkbox to Add */}
                  {splitPayers.filter((p) => !p.selected).length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <span>
                          Add more payers (
                          {splitPayers.filter((p) => !p.selected).length})
                        </span>
                        <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                        {splitPayers
                          .filter((p) => !p.selected)
                          .map((payer) => (
                            <div
                              key={payer.id}
                              className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded"
                            >
                              <Checkbox
                                id={`payer-add-${payer.id}`}
                                checked={false}
                                onCheckedChange={() =>
                                  handleSplitPayerToggle(payer.id)
                                }
                              />
                              <label
                                htmlFor={`payer-add-${payer.id}`}
                                className="flex-1 text-sm cursor-pointer text-foreground"
                              >
                                {payer.name}
                              </label>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}

                  {/* Total Display with validation feedback */}
                  {splitPayers.length > 0 && (
                    <div className="flex justify-between items-center text-sm pt-2 border-t">
                      <span className="font-medium">Total Paid:</span>
                      <span
                        className={`text-base font-bold ${
                          formData.amount &&
                          Math.abs(
                            splitPayers
                              .filter((p) => p.selected)
                              .reduce(
                                (sum, p) => sum + parseFloat(p.amount || 0),
                                0
                              ) - parseFloat(formData.amount)
                          ) > 0.01
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                      >
                        ৳
                        {splitPayers
                          .filter((p) => p.selected)
                          .reduce(
                            (sum, p) => sum + parseFloat(p.amount || 0),
                            0
                          )
                          .toFixed(2)}
                        {formData.amount && (
                          <span className="text-xs ml-2 text-muted-foreground">
                            / ৳{parseFloat(formData.amount).toFixed(2)}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Custom Cost Shares Mode */}
              {isCustomShares && (
                <div className="space-y-3 p-3 sm:p-4 bg-violet-50/50 dark:bg-violet-950/20 rounded-lg border border-violet-200 dark:border-violet-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <Label className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                      Custom cost per person
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {customShares.filter((s) => s.selected).length} selected
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAutoSplitShares}
                        className="h-8 text-xs"
                      >
                        Equal Split
                      </Button>
                    </div>
                  </div>

                  {/* Selected Members - Amount Input */}
                  <div className="space-y-2">
                    {customShares
                      .filter((s) => s.selected)
                      .map((share) => (
                        <div
                          key={share.id}
                          className="flex items-center gap-2 p-2 sm:p-3 bg-card rounded border"
                        >
                          <span className="flex-1 text-sm font-medium truncate">
                            {share.name}
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={share.amount}
                            onChange={(e) =>
                              handleCustomShareAmountChange(
                                share.id,
                                e.target.value
                              )
                            }
                            disabled={isLoading}
                            className="w-20 sm:w-24 h-9 sm:h-8 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleCustomShareToggle(share.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            title="Remove member"
                          >
                            <span className="text-lg leading-none">×</span>
                          </button>
                        </div>
                      ))}
                  </div>

                  {/* Unselected Members - Checkbox to Add */}
                  {customShares.filter((s) => !s.selected).length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <span>
                          Add more members (
                          {customShares.filter((s) => !s.selected).length})
                        </span>
                        <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                        {customShares
                          .filter((s) => !s.selected)
                          .map((share) => (
                            <div
                              key={share.id}
                              className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded"
                            >
                              <Checkbox
                                id={`share-add-${share.id}`}
                                checked={false}
                                onCheckedChange={() =>
                                  handleCustomShareToggle(share.id)
                                }
                              />
                              <label
                                htmlFor={`share-add-${share.id}`}
                                className="flex-1 text-sm cursor-pointer"
                              >
                                {share.name}
                              </label>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}

                  {/* Total Display with validation feedback */}
                  {customShares.length > 0 && (
                    <div className="flex justify-between items-center text-sm pt-2 border-t">
                      <span className="font-medium">Total Cost:</span>
                      <span
                        className={`text-base font-bold ${
                          formData.amount &&
                          Math.abs(
                            customShares
                              .filter((s) => s.selected)
                              .reduce(
                                (sum, s) => sum + parseFloat(s.amount || 0),
                                0
                              ) - parseFloat(formData.amount)
                          ) > 0.01
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                      >
                        ৳
                        {customShares
                          .filter((s) => s.selected)
                          .reduce(
                            (sum, s) => sum + parseFloat(s.amount || 0),
                            0
                          )
                          .toFixed(2)}
                        {formData.amount && (
                          <span className="text-xs ml-2 text-muted-foreground">
                            / ৳{parseFloat(formData.amount).toFixed(2)}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Shared By Members Selection - Collapsible */}
              {!isCustomShares && sharedByMembers.length > 0 && (
                <div className="rounded-lg border overflow-hidden bg-card">
                  {/* Header - Always Visible */}
                  <button
                    type="button"
                    onClick={() => setShowSharedBySection(!showSharedBySection)}
                    className="w-full flex items-center justify-between p-3 sm:p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-semibold text-foreground cursor-pointer">
                        Who shares this expense?
                      </Label>
                      {!showSharedBySection &&
                        sharedByMembers.filter((m) => m.selected).length ===
                          sharedByMembers.length && (
                          <span className="text-xs text-primary">
                            (All {sharedByMembers.length})
                          </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!showSharedBySection && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {sharedByMembers.filter((m) => m.selected).length ===
                          sharedByMembers.length
                            ? `All members • ৳${
                                formData.amount &&
                                sharedByMembers.filter((m) => m.selected)
                                  .length > 0
                                  ? (
                                      parseFloat(formData.amount) /
                                      sharedByMembers.filter((m) => m.selected)
                                        .length
                                    ).toFixed(2)
                                  : "0.00"
                              } each`
                            : `${
                                sharedByMembers.filter((m) => m.selected).length
                              } of ${sharedByMembers.length}`}
                        </span>
                      )}
                      {showSharedBySection ? (
                        <ChevronUp className="w-4 h-4 text-primary" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-primary" />
                      )}
                    </div>
                  </button>

                  {/* Expandable Content */}
                  {showSharedBySection && (
                    <div className="p-3 sm:p-4 space-y-3 bg-card border-t">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sharedByMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 p-2 sm:p-2.5 bg-muted/30 hover:bg-muted/50 rounded border hover:border-primary transition-colors"
                          >
                            <Checkbox
                              id={`shared-${member.id}`}
                              checked={member.selected}
                              onCheckedChange={() => {
                                setSharedByMembers((prev) =>
                                  prev.map((m) =>
                                    m.id === member.id
                                      ? { ...m, selected: !m.selected }
                                      : m
                                  )
                                );
                              }}
                            />
                            <label
                              htmlFor={`shared-${member.id}`}
                              className="flex-1 text-sm cursor-pointer text-foreground"
                            >
                              {member.name}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-xs pt-2 border-t">
                        <span className="text-muted-foreground">
                          {sharedByMembers.filter((m) => m.selected).length} of{" "}
                          {sharedByMembers.length} selected
                        </span>
                        <span className="font-medium text-foreground">
                          ৳
                          {formData.amount &&
                          sharedByMembers.filter((m) => m.selected).length > 0
                            ? (
                                parseFloat(formData.amount) /
                                sharedByMembers.filter((m) => m.selected).length
                              ).toFixed(2)
                            : "0.00"}{" "}
                          per person
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading || members.length === 0}
                className="h-11 sm:h-10 w-full sm:w-auto soft-button"
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

        {/* Search and Filter */}
        {expenses.length > 0 && (
          <Card className="mb-6 smooth-card">
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
                <div className="flex flex-col sm:flex-row gap-2">
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
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                  {dateFilter === "custom" && (
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        placeholder="Start date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-11 sm:h-10 w-full sm:w-auto"
                      />
                      <Input
                        type="date"
                        placeholder="End date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-11 sm:h-10 w-full sm:w-auto"
                      />
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleExportCSV}
                    className="h-11 sm:h-10"
                  >
                    <Download className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </Button>
                </div>
              </div>
              {(searchQuery || dateFilter !== "all") && (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <span>
                    Showing {filteredExpenses.length} of {expenses.length}{" "}
                    expenses
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setDateFilter("all");
                      setStartDate("");
                      setEndDate("");
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

        {/* Expenses List */}
        <Card className="smooth-card">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">
              Expense History ({filteredExpenses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {filteredExpenses.length === 0 && expenses.length > 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <Receipt className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-base">
                  No expenses match your filters
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setDateFilter("all");
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="mt-2 text-xs sm:text-sm"
                >
                  Clear filters
                </Button>
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-muted-foreground">
                <Receipt className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-base">
                  No expenses yet. Add your first expense above!
                </p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {filteredExpenses.map((expense) => (
                  <div
                    key={expense._id}
                    className="flex items-center justify-between p-3 sm:p-4 bg-muted/50 rounded-lg hover:bg-muted"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm sm:text-base truncate">
                            {expense.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {expense.payers && expense.payers.length > 0 ? (
                              // Split payment - show multiple payers
                              <span className="block truncate">
                                Paid:{" "}
                                {expense.payers
                                  .map((p) => `${p.member.name} (৳${p.amount})`)
                                  .join(", ")}
                              </span>
                            ) : (
                              // Single payment
                              <span className="block truncate">
                                Paid by {expense.paidBy?.name || "Unknown"}
                              </span>
                            )}
                            <span className="block text-xs mt-1">
                              {expense.sharedBy &&
                              expense.sharedBy.length > 0 &&
                              expense.sharedBy.length < members.length ? (
                                <>
                                  Shared by:{" "}
                                  {expense.sharedBy
                                    .map((m) => m.name)
                                    .join(", ")}{" "}
                                  • {formatDate(expense.date)}
                                </>
                              ) : (
                                <>{formatDate(expense.date)}</>
                              )}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                      <span className="text-base sm:text-lg font-bold">
                        {formatCurrency(expense.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          handleDeleteExpense(expense._id, expense.title)
                        }
                        className="soft-button"
                        aria-label={`Delete expense ${expense.title}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
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
