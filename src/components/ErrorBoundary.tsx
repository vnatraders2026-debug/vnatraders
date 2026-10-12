import { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled Application Error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-text flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-lg p-6 shadow-card text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-lg font-bold text-text">Something went wrong</h2>
            <p className="text-xs text-text-muted">
              {this.state.error?.message || 'An unexpected error occurred in the application.'}
            </p>
            <Button
              variant="primary"
              onClick={this.handleReset}
              className="w-full gap-2 justify-center"
            >
              <RotateCcw size={16} />
              <span>Reload Terminal</span>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
