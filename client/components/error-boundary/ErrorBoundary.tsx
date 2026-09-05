import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createLogger } from '../../lib/logger';
import { Button } from '../button/Button';

const logger = createLogger('error-boundary');

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// React only recognizes error boundaries implemented as class components —
// getDerivedStateFromError/componentDidCatch have no hook equivalent.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('Unhandled render error caught by error boundary', {
      message: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  public render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
          <p role="alert" className="text-lg font-semibold text-danger">
            Something went wrong.
          </p>
          <p className="text-sm text-muted-foreground">
            The game screen ran into an unexpected error. You can try again below.
          </p>
          <Button onClick={this.handleRetry}>Try again</Button>
        </main>
      );
    }
    return this.props.children;
  }
}
