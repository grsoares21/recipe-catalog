import { Component, type ReactNode } from 'react';

/** Shows what went wrong (and a way out) instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page empty">
        <p>Something went wrong.</p>
        <p><code>{this.state.error.message}</code></p>
        <button className="primary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
