import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { balancesAPI } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../components/ui/use-toast';
import { ArrowLeft, Scale, TrendingUp, TrendingDown, ArrowRight, Copy, Check } from 'lucide-react';

export default function Balances() {
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    setIsLoading(true);
    try {
      const response = await balancesAPI.get();
      setBalances(response.data.balances);
      setSettlements(response.data.settlements);
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

  const getBalanceColor = (balance) => {
    if (balance > 0) return 'text-green-600';
    if (balance < 0) return 'text-red-600';
    return 'text-slate-600';
  };

  const getBalanceIcon = (balance) => {
    if (balance > 0) return <TrendingUp className="w-5 h-5" />;
    if (balance < 0) return <TrendingDown className="w-5 h-5" />;
    return <Scale className="w-5 h-5" />;
  };

  const getBalanceBg = (balance) => {
    if (balance > 0) return 'bg-green-100';
    if (balance < 0) return 'bg-red-100';
    return 'bg-slate-100';
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/dashboard">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Scale className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Balances</h1>
              <p className="text-sm text-muted-foreground">View balances and settlements</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading balances...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Member Balances */}
            <Card>
              <CardHeader>
                <CardTitle>Member Balances</CardTitle>
                <CardDescription>
                  Positive (+) means should receive money • Negative (-) means owes money
                </CardDescription>
              </CardHeader>
              <CardContent>
                {balances.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Scale className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No balance data yet. Add members and expenses to see balances.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {balances.map((balance) => (
                      <div
                        key={balance.memberId}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${getBalanceBg(
                              balance.balance
                            )}`}
                          >
                            <span className="text-lg font-semibold">
                              {balance.memberName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium">{balance.memberName}</span>
                        </div>
                        <div className={`flex items-center gap-2 font-bold text-lg ${getBalanceColor(balance.balance)}`}>
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

            {/* Settlement Instructions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Settlement Instructions</CardTitle>
                    <CardDescription>
                      Follow these transactions to settle all balances
                    </CardDescription>
                  </div>
                  {settlements.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleCopySettlements}>
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {settlements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                      <Scale className="w-6 h-6 text-green-600" />
                    </div>
                    <p className="font-medium text-green-600">All Settled!</p>
                    <p className="text-sm">No pending settlements required.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {settlements.map((settlement, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-orange-700">
                                {settlement.from.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium">{settlement.from}</span>
                          </div>
                          <ArrowRight className="w-5 h-5 text-orange-600" />
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-green-200 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-green-700">
                                {settlement.to.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium">{settlement.to}</span>
                          </div>
                        </div>
                        <div className="text-lg font-bold text-orange-600">
                          {formatCurrency(settlement.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary */}
            {settlements.length > 0 && (
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-900">How to Settle</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-blue-800">
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Each person listed on the left should pay the person on the right</li>
                    <li>Once all transactions are completed, everyone's balance will be zero</li>
                    <li>You can mark expenses as paid or delete them after settlement</li>
                  </ol>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
