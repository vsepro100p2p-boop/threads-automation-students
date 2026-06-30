import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Trash2, Plus, Clock, Zap, Key, Eye, Sparkles, Save, CheckCircle, AlertCircle, RefreshCw, Copy, Pencil, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { logActivity } from '../lib/activityLogger';
import { supabase, getSupabaseUrl, getAuthHeaders } from '../lib/supabase';

interface Schedule {
  id: string;
  template_ids: string[];
  threads_account_id: string;
  frequency_minutes: number;
  is_enabled: boolean;
  next_post_at: string | null;
  last_post_at: string | null;
  total_posts_generated: number;
  template_names?: string[];
  generation_mode?: string;
  intro_text?: string;
  start_hour?: number | null;
  end_hour?: number | null;
  posting_mode?: string;
  last_post_was_template?: boolean;
  schedule_type?: 'interval' | 'exact_times';
  daily_times?: string[];
}

interface Template {
  id: string;
  name: string;
  threads_account_id: string;
  content: string[];
}

interface ThreadsAccount {
  id: string;
  username: string;
}

interface AIAutoPostingProps {
  user: { id: string } | null;
  accounts: ThreadsAccount[];
}

type ActiveTab = 'schedules' | 'settings' | 'test';

// Нормализация списка времён 'HH:MM': валидация, паддинг, уникальность, сортировка.
function normalizeTimesList(times: string[]): string[] {
  return Array.from(
    new Set(
      times
        .map((t) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
          if (!m) return null;
          const h = parseInt(m[1], 10);
          const mm = parseInt(m[2], 10);
          if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
          return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        })
        .filter((v): v is string => v !== null)
    )
  ).sort();
}

// Редактор списка времён публикации для режима «точное время».
// Самодостаточен: хранит локальное состояние ввода и генератора серии.
function ExactTimesEditor({
  times,
  setTimes,
}: {
  times: string[];
  setTimes: (t: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [burstStart, setBurstStart] = useState('10:00');
  const [burstCount, setBurstCount] = useState(5);
  const [burstStep, setBurstStep] = useState(12);

  const addTime = (value: string) => {
    const next = normalizeTimesList([...times, value]);
    if (next.length === times.length) return; // невалидно или дубликат
    setTimes(next);
    setInput('');
  };

  const removeTime = (t: string) => setTimes(times.filter((x) => x !== t));

  const applyPreset = (preset: string[]) => setTimes(normalizeTimesList([...times, ...preset]));

  const generateBurst = () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(burstStart.trim());
    if (!m) return;
    const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const count = Math.max(1, Math.min(60, burstCount));
    const step = Math.max(1, burstStep);
    const generated: string[] = [];
    for (let i = 0; i < count; i++) {
      const v = (startMin + i * step) % 1440;
      generated.push(`${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`);
    }
    setTimes(normalizeTimesList([...times, ...generated]));
  };

  return (
    <div className="space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200">
      <label className="block text-sm font-medium text-slate-700">
        Времена публикации (каждый день)
      </label>

      <div className="flex flex-wrap gap-2">
        {times.length === 0 ? (
          <span className="text-xs text-slate-400">Пока пусто — добавьте время ниже</span>
        ) : (
          normalizeTimesList(times).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium"
            >
              {t}
              <button type="button" onClick={() => removeTime(t)} className="hover:text-blue-950">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="time"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={() => input && addTime(input)}
          className="inline-flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => applyPreset(['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'])} className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg hover:border-blue-400">
          10–20 каждые 2ч
        </button>
        <button type="button" onClick={() => applyPreset(['09:00', '13:00', '18:00'])} className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg hover:border-blue-400">
          9 / 13 / 18
        </button>
        <button type="button" onClick={() => setTimes([])} className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg hover:border-red-400 text-red-600">
          Очистить
        </button>
      </div>

      <div className="pt-2 border-t border-slate-200">
        <div className="text-xs font-medium text-slate-600 mb-2">Серия: N постов с шагом, начиная со времени</div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Старт</label>
            <input type="time" value={burstStart} onChange={(e) => setBurstStart(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Постов</label>
            <input type="number" min={1} max={60} value={burstCount} onChange={(e) => setBurstCount(Number(e.target.value))} className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Шаг (мин)</label>
            <input type="number" min={1} value={burstStep} onChange={(e) => setBurstStep(Number(e.target.value))} className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" />
          </div>
          <button type="button" onClick={generateBurst} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm">
            Сгенерировать
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Например: 5 постов, шаг 12 мин, старт 10:00 → 10:00, 10:12, 10:24, 10:36, 10:48</p>
      </div>
    </div>
  );
}

export default function AIAutoPosting({ user, accounts }: AIAutoPostingProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>('schedules');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [frequency, setFrequency] = useState(60);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [generationMode, setGenerationMode] = useState<'creative' | 'facts_with_intro' | 'rewrite'>('creative');
  const [startHour, setStartHour] = useState(10);
  const [endHour, setEndHour] = useState(20);
  const [postingMode, setPostingMode] = useState<'creative' | 'facts' | 'alternating'>('creative');
  const [alwaysActive, setAlwaysActive] = useState(false);
  const [userTimezone, setUserTimezone] = useState('UTC');
  // Режим расписания: 'interval' (каждые N минут в окне) или 'exact_times'
  // (в конкретные времена суток). dailyTimes — список 'HH:MM'.
  const [scheduleType, setScheduleType] = useState<'interval' | 'exact_times'>('interval');
  const [dailyTimes, setDailyTimes] = useState<string[]>([]);

  // AI-ключ и провайдер настраиваются централизованно в Настройки → AI.

  const [testTemplate, setTestTemplate] = useState('');
  const [testGenerating, setTestGenerating] = useState(false);
  const [testResult, setTestResult] = useState<string[][] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testVariantCount, setTestVariantCount] = useState(1);
  const [testPrompt, setTestPrompt] = useState('');
  const [testGenerationMode, setTestGenerationMode] = useState<'creative' | 'facts_with_intro' | 'rewrite'>('creative');

  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editTemplates, setEditTemplates] = useState<string[]>([]);
  const [editFrequency, setEditFrequency] = useState(60);
  const [editGenerationMode, setEditGenerationMode] = useState<'creative' | 'facts_with_intro' | 'rewrite'>('creative');
  const [editStartHour, setEditStartHour] = useState(10);
  const [editEndHour, setEditEndHour] = useState(20);
  const [editPostingMode, setEditPostingMode] = useState<'creative' | 'facts' | 'alternating'>('creative');
  const [editAlwaysActive, setEditAlwaysActive] = useState(false);
  const [editScheduleType, setEditScheduleType] = useState<'interval' | 'exact_times'>('interval');
  const [editDailyTimes, setEditDailyTimes] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const currentAccount = useMemo(() => accounts[0], [accounts]);
  const accountId = currentAccount?.id;

  const loadSchedules = useCallback(async () => {
    if (!user || !accountId) return;

    try {
      const { data, error } = await supabase
        .from('ai_autoposting_schedules')
        .select('*')
        .eq('threads_account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const scheduleData = data || [];

      const allTemplateIds = scheduleData.flatMap(s => s.template_ids || []);
      const uniqueTemplateIds = [...new Set(allTemplateIds)];

      let templateMap = new Map<string, string>();
      if (uniqueTemplateIds.length > 0) {
        const { data: templatesData } = await supabase
          .from('thread_templates')
          .select('id, name')
          .in('id', uniqueTemplateIds);

        templateMap = new Map(templatesData?.map(t => [t.id, t.name]) || []);
      }

      const mapped = scheduleData.map((s: any) => ({
        ...s,
        template_names: (s.template_ids || []).map((id: string) => templateMap.get(id) || 'Unknown'),
      }));

      setSchedules(mapped);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }, [user, accountId]);

  const loadTemplates = useCallback(async () => {
    if (!accountId) return;

    try {
      const { data, error } = await supabase
        .from('thread_templates')
        .select('*')
        .eq('threads_account_id', accountId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }, [accountId]);


  const loadUserTimezone = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setUserTimezone(data.timezone || 'UTC');
      }
    } catch (error) {
      console.error('Error loading timezone:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user && accountId) {
      setSchedules([]);
      setTemplates([]);
      setInitialLoading(true);
      Promise.all([loadSchedules(), loadTemplates(), loadUserTimezone()]).finally(() => {
        setInitialLoading(false);
      });
    }
  }, [user, accountId, loadSchedules, loadTemplates, loadUserTimezone]);


  const testGeneration = async () => {
    if (!testTemplate) {
      setTestError('Выберите шаблон');
      return;
    }

    const template = templates.find(t => t.id === testTemplate);
    if (!template) {
      setTestError('Шаблон не найден');
      return;
    }

    setTestGenerating(true);
    setTestResult(null);
    setTestError(null);

    try {
      const headers = await getAuthHeaders();
      const apiUrl = `${getSupabaseUrl()}/functions/v1/generate-viral-threads`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          templateContent: template.content,
          variantCount: testVariantCount,
          prompt: testPrompt,
          generationMode: testGenerationMode,
        }),
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          errMsg = errBody.error || errBody.message || JSON.stringify(errBody);
        } catch {
          errMsg = await response.text().catch(() => errMsg);
        }
        throw new Error(errMsg);
      }

      const result = await response.json();
      const parsed = result.variants;

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Invalid response format');
      }

      setTestResult(parsed);
    } catch (error: any) {
      console.error('Test generation error:', error);
      if (error.message === 'No active session') {
        setTestError('Требуется авторизация. Пожалуйста, войдите в систему.');
      } else if (error.message === 'Invalid token format') {
        setTestError('Ошибка токена авторизации. Попробуйте выйти и войти снова.');
      } else if (error.message && error.message.includes('API key not configured')) {
        setTestError('AI-ключ не настроен. Откройте Настройки → AI и сохраните ключ DeepSeek или Grok.');
      } else {
        setTestError(error.message || 'Ошибка генерации');
      }
    } finally {
      setTestGenerating(false);
    }
  };

  const createSchedule = async () => {
    if (selectedTemplates.length === 0 || !currentAccount || !user) {
      showToast('Выберите хотя бы один шаблон', 'warning');
      return;
    }

    const useExact = scheduleType === 'exact_times';
    const times = normalizeTimesList(dailyTimes);
    if (useExact && times.length === 0) {
      showToast('Добавьте хотя бы одно время публикации', 'warning');
      return;
    }

    setLoading(true);
    try {
      const nextPostTime = useExact
        ? calculateNextExactTime(times, userTimezone)
        : calculateNextPostInWindow(
            frequency,
            alwaysActive ? null : startHour,
            alwaysActive ? null : endHour,
            userTimezone
          );

      const { error } = await supabase
        .from('ai_autoposting_schedules')
        .insert({
          user_id: user.id,
          template_ids: selectedTemplates,
          threads_account_id: currentAccount.id,
          frequency_minutes: frequency,
          is_enabled: true,
          next_post_at: nextPostTime.toISOString(),
          current_template_index: 0,
          generation_mode: generationMode,
          schedule_type: scheduleType,
          daily_times: useExact ? times : [],
          start_hour: useExact || alwaysActive ? null : startHour,
          end_hour: useExact || alwaysActive ? null : endHour,
          posting_mode: postingMode,
          last_post_was_template: true,
        });

      if (error) throw error;

      showToast('Расписание создано! AI начнет генерировать и публиковать посты автоматически, чередуя выбранные шаблоны.', 'success');
      logActivity(user.id, 'schedule_created', {
        entityType: 'schedule',
        frequencyMinutes: frequency,
        templateCount: selectedTemplates.length,
      });
      setShowAddModal(false);
      setSelectedTemplates([]);
      setGenerationMode('creative');
      setPostingMode('creative');
      setStartHour(10);
      setEndHour(20);
      setAlwaysActive(false);
      setScheduleType('interval');
      setDailyTimes([]);
      loadSchedules();
    } catch (error: any) {
      console.error('Error creating schedule:', error);
      showToast(`Ошибка: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSchedule = async (scheduleId: string, currentState: boolean, schedule?: Schedule) => {
    try {
      const updates: any = { is_enabled: !currentState };

      if (!currentState && schedule) {
        const nextPostTime = calculateNextPostInWindow(
          schedule.frequency_minutes,
          schedule.start_hour ?? null,
          schedule.end_hour ?? null,
          userTimezone
        );
        updates.next_post_at = nextPostTime.toISOString();
      }

      const { error } = await supabase
        .from('ai_autoposting_schedules')
        .update(updates)
        .eq('id', scheduleId);

      if (error) throw error;
      loadSchedules();
    } catch (error: any) {
      console.error('Error toggling schedule:', error);
      showToast(`Ошибка: ${error.message}`, 'error');
    }
  };

  const deleteSchedule = async (scheduleId: string) => {
    if (!confirm('Удалить это расписание?')) return;

    try {
      const { error } = await supabase
        .from('ai_autoposting_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      loadSchedules();
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      showToast(`Ошибка: ${error.message}`, 'error');
    }
  };

  const duplicateSchedule = async (schedule: Schedule) => {
    if (!user) return;

    try {
      const nextPostTime = new Date();
      nextPostTime.setMinutes(nextPostTime.getMinutes() + schedule.frequency_minutes);

      const { error } = await supabase
        .from('ai_autoposting_schedules')
        .insert({
          user_id: user.id,
          template_ids: schedule.template_ids,
          threads_account_id: schedule.threads_account_id,
          frequency_minutes: schedule.frequency_minutes,
          is_enabled: false,
          next_post_at: nextPostTime.toISOString(),
          current_template_index: 0,
          generation_mode: schedule.generation_mode,
          start_hour: schedule.start_hour,
          end_hour: schedule.end_hour,
          posting_mode: schedule.posting_mode,
          last_post_was_template: true,
        });

      if (error) throw error;

      logActivity(user.id, 'schedule_duplicated', {
        entityType: 'schedule',
        entityId: schedule.id,
      });
      showToast('Расписание скопировано (неактивно)', 'success');
      loadSchedules();
    } catch (error: any) {
      console.error('Error duplicating schedule:', error);
      showToast(`Ошибка: ${error.message}`, 'error');
    }
  };

  const calculateNextPostInWindow = (frequencyMinutes: number, startHour: number | null, endHour: number | null, timezone: string): Date => {
    const now = new Date();

    if (startHour === null || endHour === null) {
      const next = new Date(now.getTime() + frequencyMinutes * 60000);
      return next;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const currentHour = parseInt(formatter.format(now), 10);

    let isInWindow = false;
    if (startHour <= endHour) {
      isInWindow = currentHour >= startHour && currentHour < endHour;
    } else {
      isInWindow = currentHour >= startHour || currentHour < endHour;
    }

    if (isInWindow) {
      return new Date(now.getTime() + frequencyMinutes * 60000);
    }

    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const targetDate = new Date(tzDate);

    if (currentHour >= endHour && currentHour < startHour) {
      targetDate.setHours(startHour, 0, 0, 0);
    } else if (currentHour < startHour) {
      targetDate.setHours(startHour, 0, 0, 0);
    } else {
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(startHour, 0, 0, 0);
    }

    const diff = targetDate.getTime() - tzDate.getTime();
    return new Date(now.getTime() + diff);
  };

  // Следующий слот для режима «точное время» (зеркало серверного хелпера в
  // supabase/functions/process-schedules/helpers.ts). times — список 'HH:MM'.
  const calculateNextExactTime = (times: string[], timezone: string): Date => {
    const now = new Date();
    const mins = Array.from(
      new Set(
        (times || [])
          .map((t) => {
            const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
            if (!m) return NaN;
            const h = parseInt(m[1], 10);
            const mm = parseInt(m[2], 10);
            if (h < 0 || h > 23 || mm < 0 || mm > 59) return NaN;
            return h * 60 + mm;
          })
          .filter((v) => Number.isFinite(v)) as number[]
      )
    ).sort((a, b) => a - b);

    if (mins.length === 0) return new Date(now.getTime() + 60 * 60000);

    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    const year = get('year');
    const month = get('month') - 1;
    const day = get('day');
    let hour = get('hour');
    if (hour === 24) hour = 0;
    const curMinutes = hour * 60 + get('minute');

    let target = mins.find((v) => v > curMinutes);
    let dayOffset = 0;
    if (target === undefined) { target = mins[0]; dayOffset = 1; }
    const targetAsUTC = new Date(Date.UTC(year, month, day + dayOffset, Math.floor(target / 60), target % 60, 0));
    const tzOffset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: timezone })).getTime();
    return new Date(targetAsUTC.getTime() + tzOffset);
  };

  // Нормализация и сортировка списка времён 'HH:MM' (для генераторов/ввода).

  const formatNextPost = (dateString: string | null, schedule?: Schedule) => {
    if (!dateString) return 'Не запланировано';
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 0) return 'Скоро';

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let timeStr = '';
    if (days > 0) timeStr = `Через ${days}д ${hours % 24}ч`;
    else if (hours > 0) timeStr = `Через ${hours}ч ${minutes % 60}м`;
    else timeStr = `Через ${minutes}м`;

    if (schedule && schedule.start_hour !== null && schedule.end_hour !== null) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        hour: 'numeric',
        hour12: false,
      });
      const currentHour = parseInt(formatter.format(now), 10);

      let isInWindow = false;
      if (schedule.start_hour <= schedule.end_hour) {
        isInWindow = currentHour >= schedule.start_hour && currentHour < schedule.end_hour;
      } else {
        isInWindow = currentHour >= schedule.start_hour || currentHour < schedule.end_hour;
      }

      if (!isInWindow) {
        return `${timeStr} (ожидание ${String(schedule.start_hour).padStart(2, '0')}:00)`;
      }
    }

    return timeStr;
  };

  const openEditModal = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setEditTemplates(schedule.template_ids || []);
    setEditFrequency(schedule.frequency_minutes);
    setEditGenerationMode((schedule.generation_mode as 'creative' | 'facts_with_intro' | 'rewrite') || 'creative');
    setEditStartHour(schedule.start_hour ?? 10);
    setEditEndHour(schedule.end_hour ?? 20);
    setEditPostingMode((schedule.posting_mode as 'creative' | 'facts' | 'alternating') || 'creative');
    setEditAlwaysActive(schedule.start_hour === null || schedule.end_hour === null);
    setEditScheduleType(schedule.schedule_type === 'exact_times' ? 'exact_times' : 'interval');
    setEditDailyTimes(schedule.daily_times || []);
  };

  const saveEditedSchedule = async () => {
    if (!editingSchedule || editTemplates.length === 0) {
      showToast('Выберите хотя бы один шаблон', 'warning');
      return;
    }

    const useExact = editScheduleType === 'exact_times';
    const times = normalizeTimesList(editDailyTimes);
    if (useExact && times.length === 0) {
      showToast('Добавьте хотя бы одно время публикации', 'warning');
      return;
    }

    setSavingEdit(true);
    try {
      // Пересчитываем next_post_at, чтобы новые времена/режим применились сразу.
      const nextPostTime = useExact
        ? calculateNextExactTime(times, userTimezone)
        : calculateNextPostInWindow(
            editFrequency,
            editAlwaysActive ? null : editStartHour,
            editAlwaysActive ? null : editEndHour,
            userTimezone
          );

      const { error } = await supabase
        .from('ai_autoposting_schedules')
        .update({
          template_ids: editTemplates,
          frequency_minutes: editFrequency,
          generation_mode: editGenerationMode,
          schedule_type: editScheduleType,
          daily_times: useExact ? times : [],
          next_post_at: nextPostTime.toISOString(),
          start_hour: useExact || editAlwaysActive ? null : editStartHour,
          end_hour: useExact || editAlwaysActive ? null : editEndHour,
          posting_mode: editPostingMode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingSchedule.id);

      if (error) throw error;

      showToast('Расписание обновлено', 'success');
      setEditingSchedule(null);
      loadSchedules();
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      showToast(`Ошибка: ${error.message}`, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  if (!currentAccount) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Аккаунт не выбран</p>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">AI Автопостинг</h2>
          <p className="text-slate-500 mt-1 text-sm">
            AI автоматически генерирует и публикует посты на основе шаблонов
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('schedules')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition ${
            activeTab === 'schedules'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Расписания
          </div>
        </button>
        <button
          onClick={() => setActiveTab('test')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition ${
            activeTab === 'test'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Тест генерации
          </div>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Настройки
          </div>
        </button>
      </div>

      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">AI-провайдер и ключ</h3>
              <p className="text-slate-500 text-sm mt-1">
                Настраиваются централизованно для всех аккаунтов
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              Провайдер (DeepSeek / Grok), модель и API-ключ задаются в разделе
              <span className="font-semibold"> Настройки → AI</span> (шестерёнка вверху).
              Один ключ используется для генерации во всех аккаунтах.
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mt-4">
              <h4 className="font-medium text-slate-900 mb-2">Как это работает?</h4>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                <li>Вы создаете шаблон с примерами постов</li>
                <li>AI анализирует стиль, тон и структуру</li>
                <li>Генерирует уникальные посты в таком же стиле</li>
                <li>Автоматически публикует по расписанию</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'test' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Тест генерации</h3>
            <p className="text-slate-500 text-sm mb-6">
              Выберите шаблон и посмотрите, что AI сгенерирует на его основе (без публикации)
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Выберите шаблон для анализа
                </label>
                <select
                  value={testTemplate}
                  onChange={(e) => {
                    setTestTemplate(e.target.value);
                    setTestResult(null);
                    setTestError(null);
                  }}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Выберите шаблон --</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.content.length} постов)
                    </option>
                  ))}
                </select>
                {templates.length === 0 && (
                  <p className="text-sm text-amber-600 mt-2">
                    Сначала создайте шаблон во вкладке "Шаблоны"
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Режим генерации
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setTestGenerationMode('creative')}
                    className={`px-4 py-3 rounded-xl font-medium transition border-2 ${
                      testGenerationMode === 'creative'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    🎨 Креатив
                  </button>
                  <button
                    onClick={() => setTestGenerationMode('rewrite')}
                    className={`px-4 py-3 rounded-xl font-medium transition border-2 ${
                      testGenerationMode === 'rewrite'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    ✏️ Рерайт
                  </button>
                  <button
                    onClick={() => setTestGenerationMode('facts_with_intro')}
                    className={`px-4 py-3 rounded-xl font-medium transition border-2 ${
                      testGenerationMode === 'facts_with_intro'
                        ? 'bg-purple-50 border-purple-500 text-purple-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    🔬 Факты
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {testGenerationMode === 'creative' && 'Новый уникальный контент на основе стиля шаблона'}
                  {testGenerationMode === 'rewrite' && 'Минимальный рерайт — синонимы и перестановка слов, смысл не меняется'}
                  {testGenerationMode === 'facts_with_intro' && 'Генерация новых фактов в стиле шаблона'}
                </p>
              </div>

              {testGenerationMode === 'facts_with_intro' && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-sm text-slate-700 mb-2">
                    <span className="font-medium">Режим "Факты":</span>
                  </p>
                  <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                    <li>Вступление (заход) сохраняется дословно</li>
                    <li>Генерируется ровно столько веток, сколько в шаблоне</li>
                    <li>Если последняя ветка = призыв, она добавляется автоматически</li>
                    <li>Новые факты в том же стиле с номерами 100-999</li>
                    <li>AI точно сохраняет форматирование и структуру</li>
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Количество вариантов
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={testVariantCount}
                  onChange={(e) => setTestVariantCount(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {testGenerationMode === 'creative' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Дополнительные требования (опционально)
                  </label>
                  <textarea
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="Например: сделай более эмоциональным, добавь больше цифр..."
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>
              )}

              {testTemplate && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                    Исходный шаблон
                  </p>
                  <div className="space-y-2">
                    {templates.find(t => t.id === testTemplate)?.content.map((post, idx) => (
                      <div key={idx} className="bg-white rounded-lg p-3 text-sm text-slate-700 border border-slate-200">
                        <span className="text-xs text-slate-400 block mb-1">Пост {idx + 1} ({post.length} симв.)</span>
                        <p className="whitespace-pre-wrap">{post}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={testGeneration}
                disabled={testGenerating || !testTemplate}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition font-medium flex items-center justify-center gap-2"
              >
                {testGenerating ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Генерирую...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Генерировать варианты
                  </>
                )}
              </button>
            </div>
          </div>

          {testError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-800 font-medium">Ошибка генерации</p>
                  <p className="text-red-700 text-sm mt-1">{testError}</p>
                </div>
              </div>
            </div>
          )}

          {testResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-slate-900">Сгенерированные варианты ({testResult.length})</h4>
                </div>
                <button
                  onClick={testGeneration}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition text-sm font-medium flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Сгенерировать еще раз
                </button>
              </div>

              {testResult.map((variant, variantIdx) => (
                <div key={variantIdx} className="bg-white rounded-xl p-5 border border-slate-200">
                  <div className="text-sm font-medium text-slate-500 mb-4">
                    Вариант {variantIdx + 1}
                  </div>
                  <div className="space-y-4">
                    {variant.map((post, postIdx) => (
                      <div key={postIdx}>
                        <div className="text-xs text-slate-400 mb-1 font-medium">
                          {postIdx === 0 ? 'Главный пост' : `Ответ ${postIdx}`}
                        </div>
                        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                          <p className="text-slate-800 whitespace-pre-wrap">{post}</p>
                          <span className="text-xs text-slate-400 mt-2 block">
                            {post.length} символов
                          </span>
                        </div>
                        {postIdx < variant.length - 1 && (
                          <div className="my-3 border-t border-slate-100"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'schedules' && (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-medium"
            >
              <Plus className="w-4 h-4" />
              Создать расписание
            </button>
          </div>

          {schedules.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Нет активных расписаний
              </h3>
              <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                Создайте расписание, чтобы AI автоматически генерировал и публиковал посты
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-medium"
              >
                Создать первое расписание
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="bg-white rounded-xl p-5 border border-slate-200 hover:border-slate-300 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Zap className={`w-5 h-5 ${schedule.is_enabled ? 'text-amber-500' : 'text-slate-300'}`} />
                        <h3 className="text-base font-semibold text-slate-900">
                          AI Автопостинг
                        </h3>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            schedule.is_enabled
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {schedule.is_enabled ? 'Активно' : 'Приостановлено'}
                        </span>
                        {schedule.posting_mode === 'alternating' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            Микс
                          </span>
                        )}
                        {schedule.posting_mode === 'facts' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            Факты
                          </span>
                        )}
                        {schedule.schedule_type === 'exact_times' ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                            🕒 точное время
                          </span>
                        ) : schedule.start_hour === null || schedule.end_hour === null ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            24/7
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            {String(schedule.start_hour).padStart(2, '0')}:00-{String(schedule.end_hour).padStart(2, '0')}:00
                          </span>
                        )}
                      </div>
                      <div className="mb-3">
                        <p className="text-xs text-slate-500 mb-1.5">Шаблоны ({schedule.template_names?.length || 0}):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {schedule.template_names?.map((name, idx) => (
                            <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-slate-500 text-sm mb-4">
                        {schedule.schedule_type === 'exact_times'
                          ? `Публикация в: ${(schedule.daily_times || []).join(', ')}`
                          : `Публикация каждые ${schedule.frequency_minutes} минут`}
                        {schedule.generation_mode === 'facts_with_intro'
                          ? ', генерируя факты в диапазоне 1-1000'
                          : schedule.generation_mode === 'rewrite'
                          ? ', минимальный рерайт оригинала'
                          : ', чередуя шаблоны'
                        }
                      </p>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-slate-400 text-xs">Следующий пост</span>
                          <p className="text-slate-900 font-medium">
                            {formatNextPost(schedule.next_post_at, schedule)}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400 text-xs">Последний пост</span>
                          <p className="text-slate-900 font-medium">
                            {schedule.last_post_at
                              ? new Date(schedule.last_post_at).toLocaleString('ru')
                              : 'Еще не было'}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400 text-xs">Всего постов</span>
                          <p className="text-slate-900 font-medium">
                            {schedule.total_posts_generated}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => toggleSchedule(schedule.id, schedule.is_enabled, schedule)}
                        className={`p-2 rounded-lg transition ${
                          schedule.is_enabled
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                            : 'bg-green-100 hover:bg-green-200 text-green-700'
                        }`}
                        title={schedule.is_enabled ? 'Приостановить' : 'Запустить'}
                      >
                        {schedule.is_enabled ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                      </button>
                      {!schedule.is_enabled && (
                        <button
                          onClick={() => openEditModal(schedule)}
                          className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition"
                          title="Редактировать"
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => duplicateSchedule(schedule)}
                        className="p-2 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg transition"
                        title="Дублировать"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition"
                        title="Удалить"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">
                Создать AI Автопостинг
              </h3>
            </div>

            <div className="space-y-4 p-6 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Режим публикации
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPostingMode('creative')}
                    className={`p-3 rounded-xl border-2 transition text-left ${
                      postingMode === 'creative'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900 text-sm mb-1">AI</div>
                    <div className="text-xs text-slate-500">Рерайт</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostingMode('facts')}
                    className={`p-3 rounded-xl border-2 transition text-left ${
                      postingMode === 'facts'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900 text-sm mb-1">Факты</div>
                    <div className="text-xs text-slate-500">1-1000</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostingMode('alternating')}
                    className={`p-3 rounded-xl border-2 transition text-left ${
                      postingMode === 'alternating'
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900 text-sm mb-1">Микс</div>
                    <div className="text-xs text-slate-500">AI + Шаблон</div>
                  </button>
                </div>
                {postingMode === 'alternating' && (
                  <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-xs font-medium text-purple-900 mb-2">Как работает режим "Микс":</p>
                    <ul className="text-xs text-purple-800 space-y-1.5 list-none">
                      <li>1️⃣ AI рерайт шаблона 1 (с фото если есть)</li>
                      <li>2️⃣ Чистый шаблон 1 (с фото если есть)</li>
                      <li>3️⃣ AI рерайт шаблона 2 (с фото если есть)</li>
                      <li>4️⃣ Чистый шаблон 2 (с фото если есть)</li>
                      <li>... и так далее по кругу</li>
                    </ul>
                    <p className="text-xs text-purple-700 mt-2 italic">
                      Каждый шаблон используется дважды: сначала AI, потом оригинал
                    </p>
                  </div>
                )}
              </div>

              {postingMode !== 'facts' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Режим генерации AI
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setGenerationMode('creative')}
                      className={`p-4 rounded-xl border-2 transition text-left ${
                        generationMode === 'creative'
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">🎨 Креатив</div>
                      <div className="text-xs text-slate-500">Новый уникальный контент</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGenerationMode('rewrite')}
                      className={`p-4 rounded-xl border-2 transition text-left ${
                        generationMode === 'rewrite'
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">✏️ Рерайт</div>
                      <div className="text-xs text-slate-500">Минимальная перефраз.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGenerationMode('facts_with_intro')}
                      className={`p-4 rounded-xl border-2 transition text-left ${
                        generationMode === 'facts_with_intro'
                          ? 'border-purple-600 bg-purple-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">🔬 Факты</div>
                      <div className="text-xs text-slate-500">Вступление + факт</div>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Режим расписания
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleType('interval')}
                    className={`p-3 rounded-xl border-2 text-left transition ${scheduleType === 'interval' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="font-medium text-slate-900 text-sm">⏱ Интервал</div>
                    <div className="text-xs text-slate-500">Каждые N минут в окне часов</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType('exact_times')}
                    className={`p-3 rounded-xl border-2 text-left transition ${scheduleType === 'exact_times' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="font-medium text-slate-900 text-sm">🕒 Точное время</div>
                    <div className="text-xs text-slate-500">В заданные часы: 10:00, 12:00…</div>
                  </button>
                </div>
                <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-800">Часовой пояс: {userTimezone} (меняется в Настройках профиля)</p>
                </div>
              </div>

              {scheduleType === 'exact_times' && (
                <ExactTimesEditor times={dailyTimes} setTimes={setDailyTimes} />
              )}

              {scheduleType === 'interval' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Время работы автопостинга
                </label>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alwaysActive}
                    onChange={(e) => setAlwaysActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    Работать всегда (24/7)
                  </span>
                </label>
                {!alwaysActive && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Начало (час)</label>
                        <select
                          value={startHour}
                          onChange={(e) => setStartHour(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Конец (час)</label>
                        <select
                          value={endHour}
                          onChange={(e) => setEndHour(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <div className="text-xs font-medium text-slate-600 mb-2">Диапазон активности:</div>
                      <div className="grid grid-cols-12 gap-1">
                        {Array.from({ length: 24 }, (_, i) => {
                          const isActive = startHour <= endHour
                            ? (i >= startHour && i <= endHour)
                            : (i >= startHour || i <= endHour);
                          return (
                            <div
                              key={i}
                              className={`h-6 rounded flex items-center justify-center text-[10px] font-medium transition ${
                                isActive
                                  ? 'bg-green-500 text-white'
                                  : 'bg-slate-200 text-slate-400'
                              }`}
                              title={`${String(i).padStart(2, '0')}:00`}
                            >
                              {i}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Зеленые часы = автопостинг активен
                      </p>
                    </div>
                  </>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  {alwaysActive
                    ? 'Посты будут публиковаться круглосуточно'
                    : 'Посты будут публиковаться только в указанные часы (имитация живого человека)'
                  }
                </p>
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-800">
                    <p className="font-medium mb-1">Ваш часовой пояс: {userTimezone}</p>
                    <p>Все расписания работают в вашем часовом поясе. Измените его в Настройках профиля (глобальные настройки).</p>
                  </div>
                </div>
              </div>
              )}

              {generationMode === 'facts_with_intro' && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-sm text-slate-700 mb-2">
                    <span className="font-medium">Режим "Факты":</span>
                  </p>
                  <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                    <li>Вступление (заход) сохраняется дословно</li>
                    <li>Генерируется ровно столько веток, сколько в шаблоне</li>
                    <li>Если последняя ветка = призыв, она добавляется автоматически</li>
                    <li>Новые факты в том же стиле с номерами 100-999</li>
                    <li>AI точно сохраняет форматирование и структуру</li>
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Шаблоны для генерации
                </label>
                <div className="max-h-64 overflow-y-auto border border-slate-300 rounded-xl p-3 space-y-2">
                  {templates.length === 0 ? (
                    <p className="text-xs text-amber-600 text-center py-4">
                      Сначала создайте шаблон во вкладке "Шаблоны"
                    </p>
                  ) : (
                    templates.map((template) => (
                      <label
                        key={template.id}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTemplates.includes(template.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTemplates([...selectedTemplates, template.id]);
                            } else {
                              setSelectedTemplates(selectedTemplates.filter(id => id !== template.id));
                            }
                          }}
                          className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{template.name}</div>
                          <div className="text-xs text-slate-500">{template.content.length} постов в треде</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {postingMode === 'creative'
                    ? 'AI будет чередовать шаблоны по очереди при каждой публикации'
                    : postingMode === 'facts'
                    ? 'AI будет использовать эти шаблоны для генерации фактов в вашем стиле'
                    : 'Режим Микс: AI рерайт шаблона 1 → чистый шаблон 1 → AI рерайт шаблона 2 → чистый шаблон 2 и так далее'
                  }
                </p>
                {selectedTemplates.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1 font-medium">
                    Выбрано: {selectedTemplates.length} {selectedTemplates.length === 1 ? 'шаблон' : selectedTemplates.length < 5 ? 'шаблона' : 'шаблонов'}
                  </p>
                )}
              </div>

              {scheduleType === 'interval' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Частота публикаций (минуты)
                </label>
                <input
                  type="number"
                  min="10"
                  max="1440"
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Минимум 10 минут, максимум 24 часа (1440 минут)
                </p>
              </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200">
              <button
                onClick={createSchedule}
                disabled={loading || selectedTemplates.length === 0}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition font-medium"
              >
                {loading ? 'Создание...' : 'Создать'}
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedTemplates([]);
                }}
                disabled={loading}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSchedule && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                Редактировать расписание
              </h3>
              <button
                onClick={() => setEditingSchedule(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-4 p-6 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Режим публикации
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPostingMode('creative')}
                    className={`p-3 rounded-xl border-2 transition text-left ${
                      editPostingMode === 'creative'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900 text-sm mb-1">AI</div>
                    <div className="text-xs text-slate-500">Рерайт</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPostingMode('facts')}
                    className={`p-3 rounded-xl border-2 transition text-left ${
                      editPostingMode === 'facts'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900 text-sm mb-1">Факты</div>
                    <div className="text-xs text-slate-500">1-1000</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPostingMode('alternating')}
                    className={`p-3 rounded-xl border-2 transition text-left ${
                      editPostingMode === 'alternating'
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900 text-sm mb-1">Микс</div>
                    <div className="text-xs text-slate-500">AI + Шаблон</div>
                  </button>
                </div>
              </div>

              {editPostingMode !== 'facts' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Режим генерации AI
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditGenerationMode('creative')}
                      className={`p-4 rounded-xl border-2 transition text-left ${
                        editGenerationMode === 'creative'
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">🎨 Креатив</div>
                      <div className="text-xs text-slate-500">Новый уникальный контент</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditGenerationMode('rewrite')}
                      className={`p-4 rounded-xl border-2 transition text-left ${
                        editGenerationMode === 'rewrite'
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">✏️ Рерайт</div>
                      <div className="text-xs text-slate-500">Минимальная перефраз.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditGenerationMode('facts_with_intro')}
                      className={`p-4 rounded-xl border-2 transition text-left ${
                        editGenerationMode === 'facts_with_intro'
                          ? 'border-purple-600 bg-purple-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-slate-900 mb-1">🔬 Факты</div>
                      <div className="text-xs text-slate-500">Вступление + факт</div>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Режим расписания
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditScheduleType('interval')}
                    className={`p-3 rounded-xl border-2 text-left transition ${editScheduleType === 'interval' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="font-medium text-slate-900 text-sm">⏱ Интервал</div>
                    <div className="text-xs text-slate-500">Каждые N минут в окне часов</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditScheduleType('exact_times')}
                    className={`p-3 rounded-xl border-2 text-left transition ${editScheduleType === 'exact_times' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="font-medium text-slate-900 text-sm">🕒 Точное время</div>
                    <div className="text-xs text-slate-500">В заданные часы: 10:00, 12:00…</div>
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Часовой пояс: {userTimezone}</p>
              </div>

              {editScheduleType === 'exact_times' && (
                <ExactTimesEditor times={editDailyTimes} setTimes={setEditDailyTimes} />
              )}

              {editScheduleType === 'interval' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Время работы автопостинга
                </label>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAlwaysActive}
                    onChange={(e) => setEditAlwaysActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    Работать всегда (24/7)
                  </span>
                </label>
                {!editAlwaysActive && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Начало (час)</label>
                      <select
                        value={editStartHour}
                        onChange={(e) => setEditStartHour(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Конец (час)</label>
                      <select
                        value={editEndHour}
                        onChange={(e) => setEditEndHour(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Шаблоны для генерации
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-300 rounded-xl p-3 space-y-2">
                  {templates.map((template) => (
                    <label
                      key={template.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={editTemplates.includes(template.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditTemplates([...editTemplates, template.id]);
                          } else {
                            setEditTemplates(editTemplates.filter(id => id !== template.id));
                          }
                        }}
                        className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{template.name}</div>
                        <div className="text-xs text-slate-500">{template.content.length} постов</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {editScheduleType === 'interval' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Частота публикаций (минуты)
                </label>
                <input
                  type="number"
                  min="10"
                  max="1440"
                  value={editFrequency}
                  onChange={(e) => setEditFrequency(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200">
              <button
                onClick={saveEditedSchedule}
                disabled={savingEdit || editTemplates.length === 0}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition font-medium flex items-center justify-center gap-2"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Сохранить
                  </>
                )}
              </button>
              <button
                onClick={() => setEditingSchedule(null)}
                disabled={savingEdit}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
