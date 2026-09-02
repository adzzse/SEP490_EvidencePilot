import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] text-[#0f172a]">
          <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
            <div className="text-3xl font-black text-rose-600">Something went wrong</div>
            <p className="text-xs text-gray-500">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#1e3a8a] text-white text-xs font-bold rounded-lg hover:bg-blue-800 transition"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
