/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Top-level crash guard: a render/runtime error anywhere in the tree shows a
 * recovery screen with a reload action instead of a blank white page.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('FzeeLog crashed:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center space-y-4">
            <div className="text-4xl" aria-hidden>
              ⚠️
            </div>
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-slate-400">
              FzeeLog hit an unexpected error. Your data is stored safely in the
              cloud. Reload to continue.
            </p>
            {this.state.message ? (
              <p className="text-xs text-slate-500 break-words font-mono">
                {this.state.message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950 hover:bg-teal-400 transition-colors"
            >
              Reload FzeeLog
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
