import { useToast } from '../contexts/ToastContext';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const styleMap = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
};

const iconColorMap = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-amber-500',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg toast-slide-in ${styleMap[toast.type]}`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColorMap[toast.type]}`} />
            <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-black/5 transition"
            >
              <X className="w-4 h-4 opacity-60" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
