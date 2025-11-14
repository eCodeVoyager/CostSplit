import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../components/ui/use-toast';
import { Wallet } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login({ username, password });
      toast({
        title: 'Success',
        description: 'Logged in successfully!',
      });
      navigate('/dashboard');
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg p-3 sm:p-4">
      <Card className="w-full max-w-md smooth-card shadow-lg fade-in">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center ring-2 ring-primary/20">
            <Wallet className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">CostSplit</CardTitle>
            <CardDescription className="mt-2 text-base">Shared Expense Manager</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-base">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-base">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="h-12 text-base"
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold soft-button bg-gradient-to-br from-primary to-primary/90" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/30">
            <p className="font-medium">Default credentials:</p>
            <p className="font-mono text-base mt-1">admin / 1234</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
