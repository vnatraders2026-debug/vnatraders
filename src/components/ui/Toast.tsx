import React, { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { generateUUID } from '@/lib/uuid';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

interface ToastContextType {
  toast: (text: string, type?: ToastMessage['type']) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = generateUUID();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => {
          const typeClasses = {
            info: 'bg-surface border-border text-text',
            success: 'bg-surface border-success text-success',
            warning: 'bg-surface border-warning text-warning',
            error: 'bg-surface border-danger text-danger',
          };

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between p-3 border rounded shadow-subtle ${typeClasses[t.type]} text-sm`}
            >
              <span className="font-medium text-text">{t.text}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="ml-3 p-1 text-text-muted hover:text-text focus:outline-none"
                aria-label="Close notification"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: (msg: string) => console.log('Toast:', msg),
    };
  }
  return context;
}
