import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="splash error-splash">
          <h1>The workspace could not render</h1>
          <p>Your source threads are preserved. Reload to recover.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </main>
      );
    return this.props.children;
  }
}
