import { useState, useEffect } from 'react';
import { Save, Globe, Check, Activity, Boxes, Brain, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, saveSecret } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import ActivityLogPanel from './ActivityLogPanel';
import { MetaAppsPanel } from './MetaAppsPanel';

const TIMEZONES = [
  { value: 'Etc/GMT+12', label: 'UTC-12' },
  { value: 'Etc/GMT+11', label: 'UTC-11' },
  { value: 'Etc/GMT+10', label: 'UTC-10' },
  { value: 'Etc/GMT+9', label: 'UTC-9' },
  { value: 'Etc/GMT+8', label: 'UTC-8' },
  { value: 'Etc/GMT+7', label: 'UTC-7' },
  { value: 'Etc/GMT+6', label: 'UTC-6' },
  { value: 'Etc/GMT+5', label: 'UTC-5' },
  { value: 'Etc/GMT+4', label: 'UTC-4' },
  { value: 'Etc/GMT+3', label: 'UTC-3' },
  { value: 'Etc/GMT+2', label: 'UTC-2' },
  { value: 'Etc/GMT+1', label: 'UTC-1' },
  { value: 'UTC', label: 'UTC+0' },
  { value: 'Etc/GMT-1', label: 'UTC+1' },
  { value: 'Etc/GMT-2', label: 'UTC+2' },
  { value: 'Etc/GMT-3', label: 'UTC+3' },
  { value: 'Etc/GMT-4', label: 'UTC+4' },
  { value: 'Etc/GMT-5', label: 'UTC+5' },
  { value: 'Etc/GMT-6', label: 'UTC+6' },
  { value: 'Etc/GMT-7', label: 'UTC+7' },
  { value: 'Etc/GMT-8', label: 'UTC+8' },
  { value: 'Etc/GMT-9', label: 'UTC+9' },
  { value: 'Etc/GMT-10', label: 'UTC+10' },
  { value: 'Etc/GMT-11', label: 'UTC+11' },
  { value: 'Etc/GMT-12', label: 'UTC+12' },
  { value: 'Etc/GMT-13', label: 'UTC+13' },
  { value: 'Etc/GMT-14', label: 'UTC+14' },
];

type SettingsTab = 'general' | 'meta-apps' | 'ai' | 'activity';

const MODEL_OPTIONS: Record<'deepseek' | 'grok', { value: string; label: string }[]> = {
  deepseek: [
    { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (умнее)' },
    { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (дешевле/быстрее)' },
  ],
  grok: [
    { value: 'grok-4.3', label: 'Grok 4.3 (рекомендуется)' },
    { value: 'grok-4.1', label: 'Grok 4.1' },
  ],
};

const MODEL_DESCRIPTIONS: Record<string, string> = {
  'deepseek-v4-pro': 'Флагманская модель с рассуждениями (Reasoning). Идеальна для глубокого анализа структуры и сохранения стилистики автора.',
  'deepseek-v4-flash': 'Легкая модель для быстрой генерации постов. Очень экономичная и быстрая.',
  'grok-4.3': 'Последняя флагманская модель от xAI. Обладает высочайшим качеством генерации и доступом к актуальным трендам сети X.',
  'grok-4.1': 'Базовая модель от xAI, оптимизированная для быстрого создания лаконичных постов.',
};

export function SettingsPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [timezone, setTimezone] = useState('UTC');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiProvider, setAiProvider] = useState<'deepseek' | 'grok'>('deepseek');
  const [savedAiProvider, setSavedAiProvider] = useState<'deepseek' | 'grok' | null>(null);
  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('deepseek-v4-pro');
  const [grokKey, setGrokKey] = useState('');
  const [grokModel, setGrokModel] = useState('grok-4.3');
  // Ключи в БД хранятся зашифрованными — обратно в поле их не загружаем. Эти флаги
  // лишь показывают, что ключ уже сохранён (поле остаётся пустым до новой записи).
  const [hasDeepseekKey, setHasDeepseekKey] = useState(false);
  const [hasGrokKey, setHasGrokKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [savedAI, setSavedAI] = useState(false);

  const currentKey = aiProvider === 'grok' ? grokKey : deepseekKey;
  const currentModel = aiProvider === 'grok' ? grokModel : deepseekModel;
  const setCurrentKey = aiProvider === 'grok' ? setGrokKey : setDeepseekKey;
  const setCurrentModel = aiProvider === 'grok' ? setGrokModel : setDeepseekModel;

  useEffect(() => {
    loadProfile();
    loadAISettings();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setTimezone(data.timezone || 'UTC');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const saveTimezone = async () => {
    if (!user) return;

    setSaving(true);
    setSaved(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ timezone })
        .eq('id', user.id);

      if (error) throw error;

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      console.error('Error saving timezone:', error);
      showToast(`Ошибка сохранения: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadAISettings = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('ai_settings')
        .select('ai_provider, deepseek_api_key, deepseek_model, grok_api_key, grok_model')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.ai_provider === 'grok' || data?.ai_provider === 'deepseek') {
        setAiProvider(data.ai_provider as 'deepseek' | 'grok');
        setSavedAiProvider(data.ai_provider as 'deepseek' | 'grok');
      }
      setHasDeepseekKey(!!data?.deepseek_api_key);
      if (data?.deepseek_model) setDeepseekModel(data.deepseek_model);
      setHasGrokKey(!!data?.grok_api_key);
      if (data?.grok_model) setGrokModel(data.grok_model);
    } catch (e) {
      console.error('Error loading AI settings:', e);
    }
  };

  const saveAISettings = async () => {
    if (!user) return;
    setSavingAI(true);
    setSavedAI(false);
    try {
      // Несекретные поля пишем напрямую; ключи — через save-secret (шифрование).
      const nonSecret = {
        ai_provider: aiProvider,
        deepseek_model: deepseekModel.trim() || 'deepseek-v4-pro',
        grok_model: grokModel.trim() || 'grok-4.3',
      };

      const { data: existing } = await supabase
        .from('ai_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('ai_settings').update(nonSecret).eq('user_id', user.id);
      } else {
        await supabase.from('ai_settings').insert({ user_id: user.id, ...nonSecret });
      }

      setSavedAiProvider(aiProvider);

      // Шифруем и сохраняем только реально введённые ключи (пустые — не трогаем,
      // чтобы не стереть уже сохранённый ключ).
      const secretValues: Record<string, string> = {};
      if (deepseekKey.trim()) secretValues.deepseek_api_key = deepseekKey.trim();
      if (grokKey.trim()) secretValues.grok_api_key = grokKey.trim();
      if (Object.keys(secretValues).length > 0) {
        await saveSecret({ table: 'ai_settings', values: secretValues });
        if (secretValues.deepseek_api_key) setHasDeepseekKey(true);
        if (secretValues.grok_api_key) setHasGrokKey(true);
        setDeepseekKey('');
        setGrokKey('');
      }

      setSavedAI(true);
      setTimeout(() => setSavedAI(false), 3000);
    } catch (error: any) {
      showToast(`Ошибка сохранения: ${error.message}`, 'error');
    } finally {
      setSavingAI(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Настройки</h2>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition ${
            activeTab === 'general'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Общие
          </div>
        </button>
        <button
          onClick={() => setActiveTab('meta-apps')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition ${
            activeTab === 'meta-apps'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4" />
            Meta Приложения
          </div>
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition ${
            activeTab === 'ai'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            AI Настройки
          </div>
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2.5 font-medium text-sm border-b-2 transition ${
            activeTab === 'activity'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Журнал действий
          </div>
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-900">Часовой пояс</h3>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            Все расписания публикаций будут работать в выбранном часовом поясе.
          </p>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Выберите часовой пояс
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={saveTimezone}
              disabled={saving}
              className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                saved
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Сохранено
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Сохранить
                </>
              )}
            </button>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Текущее время в вашем поясе:</strong> {new Date().toLocaleString('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'meta-apps' && <MetaAppsPanel />}

      {activeTab === 'ai' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Brain className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-900">Настройки искусственного интеллекта</h3>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-800">
              Выберите ИИ провайдера
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { id: 'deepseek', label: 'DeepSeek', desc: 'Дешёвый за токен, сильный русский язык, подходит для рерайта и анализа' },
                { id: 'grok', label: 'Grok (xAI)', desc: 'Интеграция с X (Twitter), отлично улавливает свежие тренды и инфоповоды' },
              ] as const).map((opt) => {
                const isActive = savedAiProvider === opt.id;
                const isSelected = aiProvider === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAiProvider(opt.id)}
                    className={`p-4 rounded-xl border text-left transition relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-600/10'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start w-full gap-2 mb-1">
                      <span className={`font-semibold text-sm ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                        {opt.label}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] bg-green-100 text-green-800 border border-green-200 rounded-full font-bold uppercase tracking-wider">
                          <Check className="w-2.5 h-2.5" /> Выбран
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 block leading-relaxed">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {aiProvider === 'grok' ? (
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              Вы выбрали <strong>Grok от xAI</strong>. Получите API-ключ в личном кабинете на <a href="https://console.x.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">console.x.ai</a>.
            </p>
          ) : (
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              Вы выбрали <strong>DeepSeek</strong>. Получите API-ключ в личном кабинете на <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">platform.deepseek.com</a>.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-800">
                Модель генерации
              </label>
              <select
                value={currentModel}
                onChange={(e) => setCurrentModel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                {MODEL_OPTIONS[aiProvider].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 italic leading-relaxed">
                {MODEL_DESCRIPTIONS[currentModel] || 'Описание модели отсутствует.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-800">
                {aiProvider === 'grok' ? 'Grok API Key' : 'DeepSeek API Key'}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={currentKey}
                  onChange={(e) => setCurrentKey(e.target.value)}
                  placeholder={
                    (aiProvider === 'grok' ? hasGrokKey : hasDeepseekKey)
                      ? '•••••••• ключ настроен (введите новый для замены)'
                      : aiProvider === 'grok' ? 'xai-...' : 'sk-...'
                  }
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center">
                {(aiProvider === 'grok' ? hasGrokKey : hasDeepseekKey) ? (
                  <div className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-md border border-green-200 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    Ключ успешно сохранен и зашифрован в базе данных
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-medium">
                    ⚠️ API-ключ не настроен. Генерация контента работать не будет.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={saveAISettings}
              disabled={savingAI}
              className={`px-5 py-2.5 rounded-lg font-semibold transition flex items-center gap-2 ${
                savedAI
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50 shadow-sm`}
            >
              {savedAI ? (
                <>
                  <Check className="w-4 h-4" />
                  Настройки сохранены!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Сохранить настройки
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'activity' && <ActivityLogPanel />}
    </div>
  );
}
