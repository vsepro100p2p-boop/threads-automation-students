import { useState, useEffect } from 'react';
import { Calendar, Eye, Trash2, Edit2, Send, Clock } from 'lucide-react';
import { supabase, getAuthHeaders } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface DraftPost {
  id: string;
  content: string;
  thread_content: string[];
  is_thread: boolean;
  scheduled_for: string | null;
  generated_by_ai: boolean;
  status: string;
  threads_account_id: string;
  created_at: string;
}

interface ThreadsAccount {
  id: string;
  username: string;
  access_token: string;
  threads_user_id: string;
}

export default function CalendarPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [accounts, setAccounts] = useState<ThreadsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<DraftPost | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('12:00');
  const [userTimezone, setUserTimezone] = useState('UTC');

  useEffect(() => {
    if (user) {
      loadDrafts();
      loadAccounts();
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
    try {
      const { data, error } = await supabase
        .from('draft_posts')
        .select('*')
        .in('status', ['draft', 'scheduled'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (error) {
      console.error('Error loading drafts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('threads_accounts')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const generateAIPreview = async (count: number = 5) => {
    if (accounts.length === 0) {
      showToast('Сначала подключите аккаунт Threads', 'warning');
      return;
    }

    setGenerating(true);
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      const threadCount = aiSettings?.thread_count || 1;

      const headers = await getAuthHeaders();

      for (let i = 0; i < count; i++) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-post`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              user_id: user?.id,
              thread_count: threadCount,
            }),
          }
        );

        if (!response.ok) throw new Error('Failed to generate post');

        const result = await response.json();

        await supabase.from('draft_posts').insert([
          {
            user_id: user?.id,
            threads_account_id: accounts[0].id,
            content: result.content,
            thread_content: result.thread_content || [result.content],
            is_thread: result.is_thread,
            generated_by_ai: true,
            status: 'draft',
          },
        ]);
      }

      loadDrafts();
    } catch (error) {
      console.error('Error generating previews:', error);
      showToast('Ошибка при генерации постов', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const scheduleDraft = async (draft: DraftPost) => {
    if (!selectedDate || !selectedTime) {
      showToast('Выберите дату и время публикации', 'warning');
      return;
    }

    try {
      const [hours, minutes] = selectedTime.split(':');
      const tempDate = new Date(`${selectedDate}T${hours}:${minutes}:00Z`);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        timeZoneName: 'longOffset',
      });
      const parts = formatter.formatToParts(tempDate);
      const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
      const offset = offsetPart.replace('GMT', '') || '+00:00';
      const scheduledDateTime = new Date(`${selectedDate}T${hours}:${minutes}:00${offset}`).toISOString();

      const { error } = await supabase
        .from('draft_posts')
        .update({
          scheduled_for: scheduledDateTime,
          status: 'scheduled',
        })
        .eq('id', draft.id);

      if (error) throw error;

      setSelectedDraft(null);
      setSelectedDate('');
      setSelectedTime('12:00');
      loadDrafts();
    } catch (error) {
      console.error('Error scheduling draft:', error);
      showToast('Ошибка при планировании поста', 'error');
    }
  };

  const publishNow = async (draft: DraftPost) => {
    if (!confirm('Опубликовать сейчас?')) return;

    try {
      const account = accounts.find((a) => a.id === draft.threads_account_id);
      if (!account) throw new Error('Account not found');

      const pubHeaders = await getAuthHeaders();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-threads`,
        {
          method: 'POST',
          headers: pubHeaders,
          body: JSON.stringify({
            userId: account.threads_user_id,
            accessToken: account.access_token,
            texts: draft.is_thread ? draft.thread_content : [draft.content],
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to publish');

      const result = await response.json();

      await supabase.from('posts').insert([
        {
          user_id: user?.id,
          threads_account_id: draft.threads_account_id,
          content: draft.content,
          thread_content: draft.thread_content,
          is_thread: draft.is_thread,
          status: 'published',
          threads_post_id: result.postId,
          threads_post_url: result.url,
          published_at: new Date().toISOString(),
          generated_by_ai: draft.generated_by_ai,
        },
      ]);

      await supabase.from('draft_posts').delete().eq('id', draft.id);

      loadDrafts();
      showToast('Пост успешно опубликован!', 'success');
    } catch (error) {
      console.error('Error publishing:', error);
      showToast('Ошибка при публикации', 'error');
    }
  };

  const deleteDraft = async (id: string) => {
    if (!confirm('Удалить этот черновик?')) return;

    try {
      const { error } = await supabase.from('draft_posts').delete().eq('id', id);

      if (error) throw error;
      loadDrafts();
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  };

  const getAccountName = (accountId: string) => {
    return accounts.find((a) => a.id === accountId)?.username || 'Unknown';
  };

  const formatScheduledDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleString('ru', {
      timeZone: userTimezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  if (loading) {
    return <div className="text-gray-400">Загрузка...</div>;
  }

  const scheduledDrafts = drafts.filter((d) => d.status === 'scheduled');
  const unscheduledDrafts = drafts.filter((d) => d.status === 'draft');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Календарь публикаций</h2>
          <p className="text-gray-400 mt-1">
            Генерируйте превью постов и планируйте публикации
          </p>
        </div>
        <button
          onClick={() => generateAIPreview(5)}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
        >
          <Eye className="w-4 h-4" />
          {generating ? 'Генерация...' : 'Сгенерировать 5 постов'}
        </button>
      </div>

      {scheduledDrafts.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Запланированные ({scheduledDrafts.length})
          </h3>
          <div className="grid gap-3">
            {scheduledDrafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-gray-800 rounded-lg p-4 border border-blue-700"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-400 text-sm font-medium">
                        {formatScheduledDate(draft.scheduled_for)}
                      </span>
                      <span className="text-gray-500 text-xs">
                        • {getAccountName(draft.threads_account_id)}
                      </span>
                    </div>
                    <p className="text-gray-300">{draft.content}</p>
                    {draft.is_thread && draft.thread_content.length > 1 && (
                      <p className="text-gray-500 text-sm mt-2">
                        +{draft.thread_content.length - 1} постов в треде
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedDraft(draft)}
                      className="p-2 text-gray-400 hover:text-blue-400"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteDraft(draft.id)}
                      className="p-2 text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">
          Черновики ({unscheduledDrafts.length})
        </h3>
        {unscheduledDrafts.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">Нет черновиков</p>
            <p className="text-gray-500 text-sm mt-2">
              Сгенерируйте посты для предпросмотра
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {unscheduledDrafts.map((draft) => (
              <div key={draft.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-gray-300">{draft.content}</p>
                    {draft.is_thread && draft.thread_content.length > 1 && (
                      <div className="mt-2 space-y-1">
                        {draft.thread_content.slice(1).map((post, idx) => (
                          <p key={idx} className="text-gray-500 text-sm pl-4 border-l-2 border-gray-700">
                            {post}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="text-gray-500 text-xs mt-2">
                      {getAccountName(draft.threads_account_id)} •{' '}
                      {new Date(draft.created_at).toLocaleDateString('ru')}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => setSelectedDraft(draft)}
                      className="p-2 text-gray-400 hover:text-blue-400"
                      title="Запланировать"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => publishNow(draft)}
                      className="p-2 text-gray-400 hover:text-green-400"
                      title="Опубликовать сейчас"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteDraft(draft.id)}
                      className="p-2 text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedDraft && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-white mb-4">Запланировать публикацию</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Дата ({userTimezone})
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Время (24-часовой формат, {userTimezone})
                </label>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>

              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-2">Предпросмотр:</p>
                <p className="text-gray-300 text-sm">{selectedDraft.content}</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => scheduleDraft(selectedDraft)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors"
              >
                Запланировать
              </button>
              <button
                onClick={() => setSelectedDraft(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
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
