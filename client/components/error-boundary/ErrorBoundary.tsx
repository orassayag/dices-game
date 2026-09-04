import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createLogger } from '../../lib/logger';

const logger = createLogger('error-boundary');

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React only recognizes error boundaries implemented as class components
 * (getDerivedStateFromError/componentDidCatch have no hook equivalent) — this is a
 * framework requirement, not a stylistic choice to write a class here.
 */
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
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-slate-100">
          <p role="alert" className="text-lg font-semibold text-red-400">
            Something went wrong.
          </p>
          <p className="text-sm text-slate-400">
            The game screen ran into an unexpected error. You can try again below.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded bg-indigo-600 px-4 py-2 font-medium"
          >
            Try again
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
