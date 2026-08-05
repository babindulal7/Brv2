import React, { createContext, useContext, useState, useCallback } from 'react'
import { IconCheck, IconX } from '@tabler/icons-react'

export interface ToastItem {
  id: string
  title: string
  message?: string
}

interface ToastContextValue {
  showSuccessToast: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  /**
   * Law 12: Toasts only carry success events.
   * Errors are rendered inline in their parent surface.
   */
  const showSuccessToast = useCallback((title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9)
    const item: ToastItem = message ? { id, title, message } : { id, title }
    setToasts((prev) => [...prev, item])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showSuccessToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900 border border-emerald-500/60 shadow-xl rounded-xl p-4 flex items-start gap-3 animate-slideUp text-slate-100"
          >
            <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
              <IconCheck className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-white">{toast.title}</h4>
              {toast.message && <p className="text-xs text-slate-400 mt-0.5">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
