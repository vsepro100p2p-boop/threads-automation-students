import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Activity,
  Send,
  XCircle,
  FileText,
  Trash2,
  Play,
  UserPlus,
  RefreshCw,
  Sparkles,
  Calendar,
  Download,
  Upload,
  Users,
} from 'lucide-react';
import Pagination from './Pagination';

const PAGE_SIZE = 25;

interface LogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  account_username: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Activity; color: string }> = {
  post_published: { label: 'Пост опубликован', icon: Send, color: 'text-green-600 bg-green-50' },
  post_failed: { label: 'Ошибка публикации', icon: XCircle, color: 'text-red-600 bg-red-50' },
  template_created: { label: 'Шаблон создан', icon: FileText, color: 'text-blue-600 bg-blue-50' },
  template_deleted: { label: 'Шаблон удален', icon: Trash2, color: 'text-slate-600 bg-slate-50' },
  template_updated: { label: 'Шаблон обновлен', icon: FileText, color: 'text-teal-600 bg-teal-50' },
  schedule_created: { label: 'Расписание создано', icon: Calendar, color: 'text-blue-600 bg-blue-50' },
  schedule_toggled: { label: 'Расписание переключено', icon: Play, color: 'text-amber-600 bg-amber-50' },
  schedule_deleted: { label: 'Расписание удалено', icon: Trash2, color: 'text-slate-600 bg-slate-50' },
  account_added: { label: 'Аккаунт добавлен', icon: UserPlus, color: 'text-green-600 bg-green-50' },
  account_deleted: { label: 'Аккаунт удален', icon: Trash2, color: 'text-red-600 bg-red-50' },
  token_refreshed: { label: 'Токен обновлен', icon: RefreshCw, color: 'text-teal-600 bg-teal-50' },
  ai_generated: { label: 'AI генерация', icon: Sparkles, color: 'text-amber-600 bg-amber-50' },
  draft_scheduled: { label: 'Черновик запланирован', icon: Calendar, color: 'text-blue-600 bg-blue-50' },
  templates_exported: { label: 'Шаблоны экспортированы', icon: Download, color: 'text-teal-600 bg-teal-50' },
  templates_imported: { label: 'Шаблоны импортированы', icon: Upload, color: 'text-blue-600 bg-blue-50' },
  cross_publish: { label: 'Кросс-публикация', icon: Users, color: 'text-blue-600 bg-blue-50' },
};

const DEFAULT_CONFIG = { label: 'Действие', icon: Activity, color: 'text-slate-600 bg-slate-50' };

export default function ActivityLogPanel() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadLogs();
  }, [user, currentPage]);

  const loadLogs = async () => {
    if (!user) return;

    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { count } = await supabase
      .from('activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    setTotalCount(count || 0);

    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    setLogs(data || []);
    setLoading(false);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Только что';
    if (diffMin < 60) return `${diffMin} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays < 7) return `${diffDays} дн. назад`;

    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  const getDetails = (log: LogEntry): string => {
    const d = log.details;
    if (d.templateName) return String(d.templateName);
    if (d.count) return `${d.count} шт.`;
    if (d.error) return String(d.error);
    if (d.enabled !== undefined) return d.enabled ? 'Включено' : 'Приостановлено';
    return '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">Нет действий</h3>
        <p className="text-slate-500">
          Здесь будет отображаться история всех ваших действий.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-slate-600" />
          <h2 className="text-xl font-bold text-slate-900">Журнал действий</h2>
        </div>
        <span className="text-sm text-slate-500">{totalCount} записей</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {logs.map(log => {
          const config = ACTION_CONFIG[log.action] || DEFAULT_CONFIG;
          const Icon = config.icon;
          const detail = getDetails(log);

          return (
            <div key={log.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{config.label}</span>
                  {log.account_username && (
                    <span className="text-xs text-slate-400">@{log.account_username}</span>
                  )}
                </div>
                {detail && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{detail}</p>
                )}
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
                {formatTime(log.created_at)}
              </span>
            </div>
          );
        })}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalCount / PAGE_SIZE)}
        onPageChange={setCurrentPage}
        totalItems={totalCount}
        itemsPerPage={PAGE_SIZE}
      />
    </div>
  );
}
