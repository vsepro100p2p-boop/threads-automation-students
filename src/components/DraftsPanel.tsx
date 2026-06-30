import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase, getAuthHeaders } from '../lib/supabase';
import { Trash2, Calendar, Edit2, Eye, EyeOff, Sparkles, X } from 'lucide-react';

interface DraftPost {
  id: string;
  content: string;
  thread_content: string[];
  is_thread: boolean;
  generated_by_ai: boolean;
  template_id: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'cancelled';
  scheduled_for: string | null;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  content: string[];
  threads_account_id: string;
}

export default function DraftsPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [generating, setGenerating] = useState(false);
  const [schedulingDraft, setSchedulingDraft] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [userTimezone, setUserTimezone] = useState('UTC');

  useEffect(() => {
    loadDrafts();
    loadTemplates();
    if (user) {
      supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.timezone) setUserTimezone(data.timezone);
        });
    }
  }, [user]);

  const loadDrafts = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('draft_posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDrafts(data);
    }
    setLoading(false);
  };

  const deleteDraft = async (id: string) => {
    if (!confirm('Удалить этот черновик?')) return;

    const { error } = await supabase
      .from('draft_posts')
      .delete()
      .eq('id', id);

    if (!error) {
      setDrafts(drafts.filter(d => d.id !== id));
    }
  };

  const loadTemplates = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('thread_templates')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTemplates(data);
    }
  };

  const generateDrafts = async (templateId: string) => {
    setGenerating(true);

    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-post`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            templateId,
            count: 5,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка генерации');
      }

      const result = await response.json();
      showToast(`Сгенерировано ${result.created} черновиков!`, 'success');
      setShowGenerateModal(false);
      loadDrafts();
    } catch (error) {
      console.error('Error generating drafts:', error);
      showToast(`Ошибка при генерации постов: ${error.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedDraft(expandedDraft === id ? null : id);
  };

  const schedulePost = async (draftId: string) => {
    if (!scheduleDate || !scheduleTime) {
      showToast('Выберите дату и время', 'warning');
      return;
    }

    const [hours, minutes] = scheduleTime.split(':');
    const tempDate = new Date(`${scheduleDate}T${hours}:${minutes}:00Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(tempDate);
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
    const offset = offsetPart.replace('GMT', '') || '+00:00';
    const scheduledFor = new Date(`${scheduleDate}T${hours}:${minutes}:00${offset}`);

    const { error } = await supabase
      .from('draft_posts')
      .update({
        scheduled_for: scheduledFor.toISOString(),
        status: 'scheduled',
      })
      .eq('id', draftId);

    if (!error) {
      setSchedulingDraft(null);
      setScheduleDate('');
      setScheduleTime('');
      loadDrafts();
      showToast('Пост запланирован!', 'success');
    } else {
      showToast('Ошибка планирования', 'error');
    }
  };

  const renderGenerateModal = () => (
    <>
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-500" />
                Генерация постов
              </h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-600 mb-4">
              Выберите шаблон для генерации 5 постов:
            </p>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => generateDrafts(template.id)}
                  disabled={generating}
                  className="w-full text-left p-4 border-2 border-slate-200 rounded-lg hover:border-slate-900 hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="font-medium text-slate-900 mb-1">{template.name}</div>
                  <div className="text-sm text-slate-500">
                    {template.content.length} постов в треде
                  </div>
                </button>
              ))}
            </div>

            {generating && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 text-slate-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-900"></div>
                  <span>Генерируем посты...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Загрузка черновиков...</div>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <>
        {renderGenerateModal()}
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Нет черновиков</h3>
          <p className="text-slate-600 mb-6">
            Создайте шаблон и сгенерируйте посты, чтобы увидеть их здесь
          </p>
          {templates.length > 0 ? (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Sparkles className="w-5 h-5" />
              <span className="font-medium">Сгенерировать посты</span>
            </button>
          ) : (
            <p className="text-sm text-slate-500">
              Сначала создайте шаблон во вкладке "Шаблоны"
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {renderGenerateModal()}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Черновики</h2>
            <p className="text-slate-600 mt-1">
              Всего черновиков: {drafts.length}
            </p>
          </div>
          {templates.length > 0 && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Sparkles className="w-5 h-5" />
              <span className="font-medium">Сгенерировать еще</span>
            </button>
          )}
        </div>

      <div className="grid gap-4">
        {drafts.map(draft => {
          const isExpanded = expandedDraft === draft.id;
          const threadPosts = draft.thread_content || [];

          return (
            <div
              key={draft.id}
              className="bg-white rounded-lg border border-slate-200 p-6 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {draft.generated_by_ai && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-md border border-purple-300">
                        AI
                      </span>
                    )}
                    {draft.is_thread && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md border border-blue-300">
                        Тред ({threadPosts.length} постов)
                      </span>
                    )}
                    <span className={`px-2 py-1 text-xs rounded-md border ${
                      draft.status === 'scheduled'
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : draft.status === 'published'
                        ? 'bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                    }`}>
                      {draft.status === 'draft' ? 'Черновик' :
                       draft.status === 'scheduled' ? 'Запланирован' :
                       draft.status === 'published' ? 'Опубликован' : 'Отменен'}
                    </span>
                  </div>

                  <p className="text-slate-900 text-sm line-clamp-2">
                    {draft.content}
                  </p>

                  {draft.scheduled_for && (
                    <p className="text-sm text-slate-600 mt-2">
                      📅 {new Date(draft.scheduled_for).toLocaleString('ru', {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: userTimezone
                      })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {draft.is_thread && (
                    <button
                      onClick={() => toggleExpand(draft.id)}
                      className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
                      title={isExpanded ? 'Свернуть' : 'Развернуть'}
                    >
                      {isExpanded ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  )}

                  {draft.status === 'draft' && (
                    <button
                      onClick={() => setSchedulingDraft(draft.id)}
                      className="p-2 text-blue-600 hover:text-blue-700 transition-colors"
                      title="Запланировать"
                    >
                      <Calendar className="w-5 h-5" />
                    </button>
                  )}

                  <button
                    onClick={() => deleteDraft(draft.id)}
                    className="p-2 text-red-600 hover:text-red-700 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {isExpanded && draft.is_thread && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">
                    Все посты треда:
                  </h4>
                  {threadPosts.map((post, idx) => (
                    <div key={idx} className="bg-slate-50 rounded p-3 border border-slate-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-slate-500">Пост {idx + 1}</span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{post}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {schedulingDraft && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                Запланировать публикацию
              </h3>
              <button
                onClick={() => {
                  setSchedulingDraft(null);
                  setScheduleDate('');
                  setScheduleTime('');
                }}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Дата ({userTimezone})
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Время
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={() => schedulePost(schedulingDraft)}
                disabled={!scheduleDate || !scheduleTime}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Запланировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
