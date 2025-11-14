import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <CardTitle>Something went wrong</CardTitle>
                  <CardDescription>An unexpected error occurred</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We're sorry for the inconvenience. The error has been logged and we'll look into it.
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="bg-slate-100 p-3 rounded text-xs font-mono overflow-auto max-h-32">
                  <div className="text-red-600 font-semibold mb-2">{this.state.error.toString()}</div>
                  {this.state.errorInfo && (
                    <div className="text-slate-600">{this.state.errorInfo.componentStack}</div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={this.handleReset} className="flex-1">
                  Return to Dashboard
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()} className="flex-1">
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
