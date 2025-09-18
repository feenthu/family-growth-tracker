import React, { Component, ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: any
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
                    Application Error
                  </h3>
                  <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                    The application encountered an unexpected error. This might be due to data formatting issues or calculation problems.
                  </p>
                  <div className="mt-4">
                    <button
                      onClick={() => window.location.reload()}
                      className="bg-red-100 dark:bg-red-800 hover:bg-red-200 dark:hover:bg-red-700 text-red-800 dark:text-red-200 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Reload Application
                    </button>
                  </div>
                  {process.env.NODE_ENV === 'development' && this.state.error && (
                    <details className="mt-4">
                      <summary className="text-sm text-red-600 dark:text-red-400 cursor-pointer">
                        Error Details (Development)
                      </summary>
                      <div className="mt-2 p-3 bg-red-100 dark:bg-red-900/40 rounded text-xs text-red-800 dark:text-red-200 font-mono overflow-auto">
                        <div className="mb-2">
                          <strong>Error:</strong> {this.state.error.message}
                        </div>
                        <div>
                          <strong>Stack:</strong>
                          <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}