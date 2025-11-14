import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { balancesAPI, settlementsAPI } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useToast } from '../components/ui/use-toast';
import { ArrowLeft, Scale, TrendingUp, TrendingDown, ArrowRight, Copy, Check, CheckCircle2, History, Filter } from 'lucide-react';

export default function Balances() {
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [completedSettlements, setCompletedSettlements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [periodFilter, setPeriodFilter] = useState('all');
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchBalances();
  }, []);

  useEffect(() => {
    if (showHistory) {
      fetchSettlementHistory();
    }
  }, [periodFilter, showHistory]);

  const fetchBalances = async () => {
    setIsLoading(true);
    try {
      const response = await balancesAPI.get();
      setBalances(response.data.balances);
      setSettlements(response.data.settlements);
      setCompletedSettlements(response.data.completedSettlements || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch balances',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettlementHistory = async () => {
    try {
      const params = periodFilter !== 'all' ? { period: periodFilter } : {};
      const response = await settlementsAPI.getHistory(params);
      setCompletedSettlements(response.data.settlements || []);
    } catch (error) {
      console.error('Error fetching settlement history:', error);
    }
  };

  const getBalanceColor = (balance) => {
    if (balance > 0) return 'text-green-600';
    if (balance < 0) return 'text-red-600';
    return 'text-slate-600';
  };

  const getBalanceIcon = (balance) => {
    if (balance > 0) return <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />;
    if (balance < 0) return <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />;
    return <Scale className="w-4 h-4 sm:w-5 sm:h-5" />;
  };

  const getBalanceBg = (balance) => {
    if (balance > 0) return 'bg-green-100';
    if (balance < 0) return 'bg-red-100';
    return 'bg-slate-100';
  };

  const handleMarkAsPaid = async (settlement) => {
    try {
      await settlementsAPI.markAsPaid({
        from: settlement.fromId,
        to: settlement.toId,
        amount: settlement.amount,
        note: `Settlement payment: ${settlement.from} → ${settlement.to}`,
      });

      toast({
        title: 'Success',
        description: 'Settlement marked as paid',
      });

      // Refresh balances
      fetchBalances();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to mark settlement as paid',
        variant: 'destructive',
      });
    }
  };

  const handleCopySettlements = () => {
    if (settlements.length === 0) {
      toast({
        title: 'No settlements',
        description: 'All balances are settled',
      });
      return;
    }

    const text = settlements
      .map((s, i) => `${i + 1}. ${s.from} pays ${s.to}: ${formatCurrency(s.amount)}`)
      .join('\n');

    const fullText = `CostSplit Settlements:\n\n${text}\n\nTotal: ${settlements.length} transaction(s)`;

    navigator.clipboard.writeText(fullText).then(
      () => {
        setCopied(true);
        toast({
          title: 'Copied!',
          description: 'Settlement instructions copied to clipboard',
        });
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        toast({
          title: 'Error',
          description: 'Failed to copy to clipboard',
          variant: 'destructive',
        });
      }
    );
  };

  return (
    <div className="min-h-screen gradient-bg pb-6">
      <div className="container mx-auto px-3 py-4 sm:p-6 max-w-4xl">
        {/* Mobile-Optimized Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8 fade-in">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 soft-button">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-violet-200">
              <Scale className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-600 to-violet-500 bg-clip-text text-transparent">Balances</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">View balances and settlements</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 sm:py-12">
            <p className="text-sm sm:text-base text-muted-foreground">Loading balances...</p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Mobile-Optimized Member Balances */}
            <Card className="smooth-card fade-in" style={{ animationDelay: '0.1s' }}>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl">Member Balances</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Positive (+) means should receive money • Negative (-) means owes money
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {balances.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-muted-foreground">
                    <Scale className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base">No balance data yet. Add members and expenses to see balances.</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {balances.map((balance) => (
                      <div
                        key={balance.memberId}
                        className="flex items-center justify-between p-3 sm:p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 active:bg-secondary/60 transition-all"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getBalanceBg(
                              balance.balance
                            )}`}
                          >
                            <span className="text-base sm:text-lg font-semibold">
                              {balance.memberName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-sm sm:text-base truncate">{balance.memberName}</span>
                        </div>
                        <div className={`flex items-center gap-1 sm:gap-2 font-bold text-base sm:text-lg flex-shrink-0 ml-2 ${getBalanceColor(balance.balance)}`}>
                          {getBalanceIcon(balance.balance)}
                          <span>
                            {balance.balance > 0 && '+'}
                            {formatCurrency(balance.balance)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mobile-Optimized Settlement Instructions */}
            <Card className="smooth-card fade-in" style={{ animationDelay: '0.2s' }}>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">Settlement Instructions</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Follow these transactions to settle all balances
                    </CardDescription>
                  </div>
                  {settlements.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySettlements}
                      className="h-9 sm:h-8 w-full sm:w-auto"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          <span className="text-sm">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          <span className="text-sm">Copy</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {settlements.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-muted-foreground">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 bg-green-100 rounded-full flex items-center justify-center">
                      <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                    </div>
                    <p className="font-medium text-green-600 text-base sm:text-lg">All Settled!</p>
                    <p className="text-xs sm:text-sm">No pending settlements required.</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {settlements.map((settlement, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-3 p-3 sm:p-4 bg-gradient-to-r from-orange-50/80 to-amber-50/80 rounded-lg border border-orange-200/50 hover:border-orange-300/60 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center">
                                <span className="text-xs sm:text-sm font-semibold text-orange-700">
                                  {settlement.from.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="font-medium text-sm sm:text-base hidden sm:block">{settlement.from}</span>
                              <span className="font-medium text-xs sm:hidden">{settlement.from}</span>
                            </div>
                            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" />
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="w-8 h-8 bg-green-200 rounded-full flex items-center justify-center">
                                <span className="text-xs sm:text-sm font-semibold text-green-700">
                                  {settlement.to.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="font-medium text-sm sm:text-base hidden sm:block">{settlement.to}</span>
                              <span className="font-medium text-xs sm:hidden">{settlement.to}</span>
                            </div>
                          </div>
                          <div className="text-base sm:text-lg font-bold text-orange-600 flex-shrink-0">
                            {formatCurrency(settlement.amount)}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleMarkAsPaid(settlement)}
                          size="sm"
                          className="w-full sm:w-auto h-9 soft-button bg-gradient-to-br from-green-600 to-green-500 hover:from-green-700 hover:to-green-600"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          <span className="text-xs sm:text-sm">Mark as Paid</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mobile-Optimized Summary */}
            {settlements.length > 0 && (
              <Card className="smooth-card bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 fade-in" style={{ animationDelay: '0.3s' }}>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-primary text-lg sm:text-xl">How to Settle</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 text-xs sm:text-sm text-foreground/80">
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Each person listed on the left should pay the person on the right</li>
                    <li>Once all transactions are completed, everyone's balance will be zero</li>
                    <li>Click "Mark as Paid" when payment is completed</li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {/* Settlement History */}
            {completedSettlements.length > 0 && (
              <Card className="smooth-card fade-in" style={{ animationDelay: '0.4s' }}>
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-slate-600" />
                      <CardTitle className="text-lg sm:text-xl">Payment History</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={periodFilter} onValueChange={setPeriodFilter}>
                        <SelectTrigger className="w-[140px] h-9">
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowHistory(!showHistory)}
                        className="h-9"
                      >
                        {showHistory ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {showHistory && (
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <div className="space-y-2">
                      {completedSettlements.map((settlement) => (
                        <div
                          key={settlement._id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-green-50 rounded-lg border border-green-200"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="text-sm">
                              <span className="font-medium">{settlement.from}</span>
                              <ArrowRight className="w-3 h-3 inline mx-1" />
                              <span className="font-medium">{settlement.to}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                            <span className="font-semibold text-green-700">
                              {formatCurrency(settlement.amount)}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span>{formatDate(settlement.paidDate)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
