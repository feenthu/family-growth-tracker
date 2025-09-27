import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearAllToasts: () => void
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function useToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000 // Default 5 seconds
    }

    setToasts(prev => [...prev, newToast])

    // Auto-remove after duration
    if (newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, newToast.duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const clearAllToasts = useCallback(() => {
    setToasts([])
  }, [])

  return {
    toasts,
    addToast,
    removeToast,
    clearAllToasts
  }
}

// Convenience functions for common toast types
export function useToastHelpers() {
  const { addToast } = useToast()

  return {
    showSuccess: (title: string, message?: string) =>
      addToast({ type: 'success', title, message }),

    showError: (title: string, message?: string) =>
      addToast({ type: 'error', title, message, duration: 8000 }),

    showWarning: (title: string, message?: string) =>
      addToast({ type: 'warning', title, message }),

    showInfo: (title: string, message?: string) =>
      addToast({ type: 'info', title, message }),
  }
}