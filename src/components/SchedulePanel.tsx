import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Clock, PlayCircle, PauseCircle, Sparkles } from 'lucide-react';

interface Schedule {
  id: string;
  threads_account_id: string;
  is_enabled: boolean;
  frequency_minutes: number;
  next_post_at: string;
  last_post_at: string | null;
  account_username: string;
}

export function SchedulePanel({ onUpdate }: { onUpdate: () => void }) {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [frequency, setFrequency] = useState(120);

  const frequencyOptions = [
    { value: 30, label: 'Каждые 30 минут' },
    { value: 60, label: 'Каждый час' },
    { value: 120, label: 'Каждые 2 часа' },
    { value: 180, label: 'Каждые 3 часа' },
    { value: 360, label: 'Каждые 6 часов' },
    { value: 720, label: 'Каждые 12 часов' },
    { value: 1440, label: 'Раз в день' },
  ];

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);

    const { data: accountsData } = await supabase
      .from('threads_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    setAccounts(accountsData || []);

    const { data: schedulesData } = await supabase
      .from('post_schedules')
      .select(`
        *,
        threads_accounts (username)
      `)
      .eq('user_id', user.id);

    if (schedulesData) {
      const formattedSchedules = schedulesData.map((s: any) => ({
        ...s,
        account_username: s.threads_accounts?.username || 'Unknown',
      }));
      setSchedules(formattedSchedules);
    }

    setLoading(false);
  };

  const handleCreateSchedule = async () => {
    if (!selectedAccount) return;

    const { error } = await supabase
      .from('post_schedules')
      .insert({
        user_id: user!.id,
        threads_account_id: selectedAccount,
        frequency_minutes: frequency,
        is_enabled: true,
        next_post_at: new Date().toISOString(),
      });

    if (!error) {
      setShowAddForm(false);
      setSelectedAccount('');
      loadData();
      onUpdate();
    }
  };

  const toggleSchedule = async (scheduleId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('post_schedules')
      .update({
        is_enabled: !currentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId);

    if (!error) {
      loadData();
      onUpdate();
    }
  };

  const updateFrequency = async (scheduleId: string, newFrequency: number) => {
    const { error } = await supabase
      .from('post_schedules')
      .update({
        frequency_minutes: newFrequency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId);

    if (!error) {
      loadData();
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Никогда';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const availableAccounts = accounts.filter(
    (account) => !schedules.some((s) => s.threads_account_id === account.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Расписание публикаций</h3>
          <p className="text-sm text-slate-600 mt-1">
            Настройте автоматическую генерацию и публикацию постов
          </p>
        </div>
        {availableAccounts.length > 0 && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
          >
            <Clock className="w-4 h-4" />
            <span>Добавить расписание</span>
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
          <h4 className="font-medium text-slate-900 mb-4">Создать расписание</h4>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Выберите аккаунт
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              >
                <option value="">Выберите аккаунт</option>
                {availableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Частота публикаций
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              >
                {frequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleCreateSchedule}
                disabled={!selectedAccount}
                className="flex-1 bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
              >
                Создать расписание
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
          <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">Нет настроенных расписаний</h3>
          <p className="text-slate-600">
            {accounts.length === 0
              ? 'Сначала добавьте Threads аккаунт'
              : 'Создайте расписание для автоматизации'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="border border-slate-200 rounded-lg p-6 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      schedule.is_enabled ? 'bg-green-500' : 'bg-slate-300'
                    }`}
                  />
                  <div>
                    <p className="font-medium text-slate-900">{schedule.account_username}</p>
                    <p className="text-sm text-slate-500">
                      {schedule.is_enabled ? 'Активно' : 'Приостановлено'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleSchedule(schedule.id, schedule.is_enabled)}
                  className={`p-2 rounded-lg transition ${
                    schedule.is_enabled
                      ? 'text-amber-600 hover:bg-amber-50'
                      : 'text-green-600 hover:bg-green-50'
                  }`}
                >
                  {schedule.is_enabled ? (
                    <PauseCircle className="w-5 h-5" />
                  ) : (
                    <PlayCircle className="w-5 h-5" />
                  )}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Частота
                  </label>
                  <select
                    value={schedule.frequency_minutes}
                    onChange={(e) => updateFrequency(schedule.id, Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  >
                    {frequencyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">Следующий пост</p>
                    <p className="text-sm text-slate-900">{formatDate(schedule.next_post_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">Последний пост</p>
                    <p className="text-sm text-slate-900">{formatDate(schedule.last_post_at)}</p>
                  </div>
                </div>
              </div>

              {schedule.is_enabled && (
                <div className="mt-4 flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <Sparkles className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs text-green-800">
                    AI будет автоматически генерировать и публиковать посты по расписанию
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
