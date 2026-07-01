import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sparkles, Send, Save, RefreshCw } from 'lucide-react';
import { supabase, getSupabaseUrl, getAuthHeaders } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

interface ThreadVariant {
  id: string;
  posts: string[];
  selected: boolean;
}

interface Template {
  id: string;
  name: string;
  content: string[];
  media_urls?: string[];
}

interface ThreadsAccount {
  id: string;
  username: string;
}

interface ViralThreadGeneratorProps {
  user: { id: string } | null;
  accounts: ThreadsAccount[];
  isActive?: boolean;
}

export default function ViralThreadGenerator({ user, accounts, isActive }: ViralThreadGeneratorProps) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [variantCount, setVariantCount] = useState(3);
  const [prompt, setPrompt] = useState('');
  const [generationMode, setGenerationMode] = useState<'creative' | 'rewrite'>('creative');
  const [variants, setVariants] = useState<ThreadVariant[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveAsSchedule, setSaveAsSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [initialLoading, setInitialLoading] = useState(true);

  const currentAccount = useMemo(() => accounts[0], [accounts]);
  const accountId = currentAccount?.id;

  const loadTemplates = useCallback(async () => {
    if (!accountId) return;

    const { data } = await supabase
      .from('thread_templates')
      .select('*')
      .eq('threads_account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (data) {
      setTemplates(data);
    }
  }, [accountId]);

  const lastLoadedAccountIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && accountId && (isActive === undefined || isActive)) {
      const isAccountChanged = lastLoadedAccountIdRef.current !== accountId;
      if (isAccountChanged) {
        setInitialLoading(true);
        lastLoadedAccountIdRef.current = accountId;
      }
      loadTemplates().finally(() => {
        if (isAccountChanged) {
          setInitialLoading(false);
        }
      });
      const now = new Date();
      now.setHours(now.getHours() + 1);
      setScheduleDate(now.toISOString().split('T')[0]);
    }
  }, [user, accountId, isActive, loadTemplates]);

  const generateVariants = async () => {
    if (!selectedTemplate) {
      showToast('Выберите шаблон', 'warning');
      return;
    }

    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) return;

    setGenerating(true);
    try {
      const headers = await getAuthHeaders();
      const apiUrl = `${getSupabaseUrl()}/functions/v1/generate-viral-threads`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          templateContent: template.content,
          variantCount,
          prompt,
          generationMode,
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

      const newVariants: ThreadVariant[] = parsed.map((posts, idx) => ({
        id: `variant-${Date.now()}-${idx}`,
        posts,
        selected: false,
      }));

      setVariants(newVariants);
    } catch (error: any) {
      console.error('Generation error:', error);
      if (error.message === 'No active session') {
        showToast('Требуется авторизация. Пожалуйста, войдите в систему.', 'error');
      } else if (error.message === 'Invalid token format') {
        showToast('Ошибка токена авторизации. Попробуйте выйти и войти снова.', 'error');
      } else {
        showToast(`Ошибка генерации: ${error.message}`, 'error');
      }
    } finally {
      setGenerating(false);
    }
  };

  const toggleVariant = (variantId: string) => {
    setVariants(
      variants.map(v =>
        v.id === variantId ? { ...v, selected: !v.selected } : v
      )
    );
  };

  const saveSelectedToTemplates = async () => {
    const selected = variants.filter(v => v.selected);
    if (selected.length === 0) {
      showToast('Выберите хотя бы один вариант', 'warning');
      return;
    }

    if (!currentAccount || !user) {
      showToast('Аккаунт не выбран', 'warning');
      return;
    }

    const sourceTemplate = templates.find(t => t.id === selectedTemplate);
    const sourceMediaUrls = sourceTemplate?.media_urls || [];

    setSaving('saving');
    try {
      if (saveAsSchedule) {
        if (!scheduleDate || !scheduleTime) {
          showToast('Укажите дату и время публикации', 'warning');
          return;
        }

        const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
        const intervalMinutes = 60;

        for (let i = 0; i < selected.length; i++) {
          const variant = selected[i];
          const scheduledFor = new Date(scheduledDateTime);
          scheduledFor.setMinutes(scheduledFor.getMinutes() + i * intervalMinutes);

          const { data: template } = await supabase
            .from('thread_templates')
            .insert({
              user_id: user.id,
              threads_account_id: currentAccount.id,
              name: `AI Generated ${new Date().toLocaleString('ru')} #${i + 1}`,
              content: variant.posts,
              media_urls: sourceMediaUrls,
              is_active: true,
            })
            .select()
            .single();

          if (template) {
            await supabase.from('template_schedules').insert({
              user_id: user.id,
              template_id: template.id,
              scheduled_for: scheduledFor.toISOString(),
              status: 'pending',
              ai_only_mode: true,
            });
          }
        }

        showToast(`Сохранено ${selected.length} постов в расписание`, 'success');
      } else {
        const templatesToInsert = selected.map(variant => ({
          user_id: user.id,
          threads_account_id: currentAccount.id,
          name: `AI Generated ${new Date().toLocaleString('ru')}`,
          content: variant.posts,
          media_urls: sourceMediaUrls,
          is_active: true,
        }));

        const { error } = await supabase
          .from('thread_templates')
          .insert(templatesToInsert);

        if (error) throw error;

        showToast(`Сохранено ${selected.length} шаблонов`, 'success');
      }

      setVariants(variants.filter(v => !v.selected));
      loadTemplates();
    } catch (error: any) {
      console.error('Save error:', error);
      showToast(`Ошибка сохранения: ${error.message}`, 'error');
    } finally {
      setSaving(null);
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
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-blue-600" />
        <div>
          <h2 className="text-xl font-bold text-slate-900">AI Генератор Вирусных Тредов</h2>
          <p className="text-sm text-slate-500">Создавайте уникальные варианты на основе шаблонов</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Выберите шаблон для анализа
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
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
            Количество вариантов
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={variantCount}
            onChange={(e) => setVariantCount(Number(e.target.value))}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Режим генерации
          </label>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setGenerationMode('creative')}
              className={`flex-1 py-2.5 text-sm rounded-lg font-medium transition-all ${
                generationMode === 'creative'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              🎨 Креатив
            </button>
            <button
              type="button"
              onClick={() => setGenerationMode('rewrite')}
              className={`flex-1 py-2.5 text-sm rounded-lg font-medium transition-all ${
                generationMode === 'rewrite'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              ✏️ Рерайт
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {generationMode === 'creative'
              ? 'Новый контент на основе стиля шаблона'
              : 'Минимальный рерайт — синонимы и перестановка слов, смысл сохраняется'
            }
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Дополнительные требования (опционально)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Например: сделай более эмоциональным, добавь больше цифр..."
            className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
          />
        </div>

        <button
          onClick={generateVariants}
          disabled={generating || !selectedTemplate}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition font-medium"
        >
          {generating ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Генерирую...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Генерировать варианты
            </>
          )}
        </button>
      </div>

      {variants.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Сгенерированные варианты ({variants.filter(v => v.selected).length} выбрано)
            </h3>

            <div className="space-y-4 mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveAsSchedule"
                  checked={saveAsSchedule}
                  onChange={(e) => setSaveAsSchedule(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="saveAsSchedule" className="text-sm text-slate-600">
                  Сохранить в расписание (посты будут публиковаться с интервалом 1 час)
                </label>
              </div>

              {saveAsSchedule && (
                <div className="flex gap-4 p-4 bg-slate-50 rounded-xl">
                  <div className="flex-1">
                    <label className="block text-sm text-slate-700 mb-2">Дата первой публикации</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-slate-700 mb-2">Время</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={saveSelectedToTemplates}
              disabled={variants.filter(v => v.selected).length === 0 || saving !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition font-medium"
            >
              <Save className="w-4 h-4" />
              {saveAsSchedule ? 'Добавить в расписание' : 'Сохранить в шаблоны'}
            </button>
          </div>

          {variants.map((variant) => (
            <div
              key={variant.id}
              className={`bg-white rounded-xl p-5 border-2 transition-all cursor-pointer ${
                variant.selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => toggleVariant(variant.id)}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={variant.selected}
                  onChange={() => toggleVariant(variant.id)}
                  className="mt-1 w-5 h-5 text-blue-600 rounded"
                />
                <div className="flex-1 space-y-4">
                  {variant.posts.map((post, idx) => (
                    <div key={idx}>
                      <div className="text-xs text-slate-400 mb-1 font-medium">
                        {idx === 0 ? 'Главный пост' : `Ответ ${idx}`}
                      </div>
                      <div className="text-slate-700 whitespace-pre-wrap">{post}</div>
                      {idx < variant.posts.length - 1 && (
                        <div className="my-3 border-t border-slate-100"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
