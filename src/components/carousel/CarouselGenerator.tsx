import { useState, useRef, useCallback, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { Loader2, Download, Dice5, Upload, Save, Check, Bookmark, Trash2, FolderOpen, Send } from 'lucide-react';
import { supabase, getAuthHeaders } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { CarouselContent, CarouselDesign, UserProfile, Slide, CTAType } from './carouselTypes';
import CarouselSlide from './CarouselSlide';
import CarouselDesignPicker from './CarouselDesignPicker';

interface SavedTemplate {
  id: string;
  name: string;
  content: CarouselContent;
  design: CarouselDesign;
  created_at: string;
}

interface ThreadsAccount {
  id: string;
  username: string;
}

const PREVIEW_CONTENT: CarouselContent = {
  first_page_title: 'ПРО ЭТИ ЧИТ КОДЫ ДЛЯ CHATGPT НИКТО НЕ ЗНАЕТ\nУ ChatGpt есть секретные команды',
  content_pages: [
    {
      title: '1. Режим Бога',
      intro_paragraph: 'Думал — это просто поиск. Оказалось — это актерская игра.',
      points: [
        'Большинство пишет: «Напиши пост про продажи». Получают пресную воду, которую стыдно публиковать. Секрет в ролевой модели.',
        'Скажи ему: «Ты — циничный маркетолог с 20-летним стажем». И он меняется. Тон, лексика, аргументы.',
      ],
      blockquote_text: 'Контекст важнее самого запроса.',
    },
    {
      title: '2. Градус безумия',
      intro_paragraph: 'Казалось — рандом. Оказалось — управляемый хаос.',
      points: [
        'У него есть скрытый тумблер креатива. Команда «Temperature». По умолчанию стоит 0.7 — это среднее по больнице.',
        'Нужны факты? Ставь 0. Нужен взрыв мозга? Ставь 1.0. Управляй хаосом, иначе хаос управляет тобой.',
      ],
      blockquote_text: 'Настраивай уровень галлюцинаций вручную.',
    },
    {
      title: '3. Режим критика',
      intro_paragraph: 'Казалось — готово. Оказалось — черновик.',
      points: [
        'Никогда не бери первый ответ. Это драфт. Заставь его работать над ошибками.',
        'Напиши: «Критикуй этот текст. Найди дыры. Сделай его злее». Он сам себя редактирует лучше любого корректора.',
      ],
      blockquote_text: 'Первый вариант всегда для мусорки.',
    },
  ],
  call_to_action_page: {
    title: 'ЗАБЕРИ ЭТОТ МАТЕРИАЛ',
    description: 'Напиши "промты" в директ чтобы получить гайд. Подпишись — тут только то, что меняет мышление.',
  },
};

export default function CarouselGenerator() {
  const { user } = useAuth();
  const [topic, setTopic] = useState('');
  const [ctaType, setCtaType] = useState<CTAType>('custom');
  const [customCtaText, setCustomCtaText] = useState('');
  const [activity, setActivity] = useState('');
  const [numSlides, setNumSlides] = useState(5);
  const [carouselContent, setCarouselContent] = useState<CarouselContent | null>(PREVIEW_CONTENT);

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<CarouselDesign>('notes');
  const [isCustomTitle, setIsCustomTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const [accounts, setAccounts] = useState<ThreadsAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isSavingToTemplates, setIsSavingToTemplates] = useState(false);
  const [savedToTemplates, setSavedToTemplates] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Your Name',
    handle: '@username',
    avatarUrl: null,
  });

  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [settingsRes, accountsRes] = await Promise.all([
        supabase
          .from('carousel_settings')
          .select('display_name, handle, custom_cta_text')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('threads_accounts')
          .select('id, username')
          .eq('user_id', user.id),
      ]);

      if (settingsRes.data) {
        if (settingsRes.data.display_name) setUserProfile(prev => ({ ...prev, name: settingsRes.data.display_name }));
        if (settingsRes.data.handle) setUserProfile(prev => ({ ...prev, handle: settingsRes.data.handle }));
        if (settingsRes.data.custom_cta_text) setCustomCtaText(settingsRes.data.custom_cta_text);
      }
      if (accountsRes.data && accountsRes.data.length > 0) {
        setAccounts(accountsRes.data);
        setSelectedAccountId(accountsRes.data[0].id);
      }
      setSettingsLoaded(true);
    })();
    loadSavedTemplates();
  }, [user]);

  const loadSavedTemplates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('carousel_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setSavedTemplates(data as SavedTemplate[]);
  };

  const handleSaveToThreadTemplates = async () => {
    if (!user || !carouselContent || !selectedAccountId) return;
    setIsSavingToTemplates(true);
    setSavedToTemplates(false);
    setError(null);
    try {
      const elements = slideRefs.current.filter((el) => el !== null) as HTMLDivElement[];
      const uploadedUrls: string[] = [];
      const timestamp = Date.now();

      for (let i = 0; i < elements.length; i++) {
        const dataUrl = await toPng(elements[i], { quality: 1.0, pixelRatio: 3 });
        const base64 = dataUrl.split(',')[1];
        const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const filePath = `${user.id}/carousel-${timestamp}-${i + 1}.png`;

        const { error: uploadErr } = await supabase.storage
          .from('template-images')
          .upload(filePath, byteArray, { contentType: 'image/png', upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('template-images')
          .getPublicUrl(filePath);
        uploadedUrls.push(urlData.publicUrl);
      }

      const { error: insertErr } = await supabase
        .from('thread_templates')
        .insert({
          user_id: user.id,
          threads_account_id: selectedAccountId,
          name: carouselContent.first_page_title.slice(0, 60),
          content: [carouselContent.first_page_title],
          media_urls: uploadedUrls,
          frequency_days: 7,
          is_active: false,
        });

      if (insertErr) throw insertErr;
      setSavedToTemplates(true);
      setTimeout(() => setSavedToTemplates(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения в шаблоны.');
    } finally {
      setIsSavingToTemplates(false);
    }
  };

  const handleLoadTemplate = (template: SavedTemplate) => {
    setCarouselContent(template.content);
    setSelectedDesign(template.design);
    setIsGenerated(true);
    setShowTemplates(false);
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error: err } = await supabase.from('carousel_templates').delete().eq('id', id);
    if (!err) setSavedTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleSaveCarouselDraft = async () => {
    if (!user || !carouselContent) return;
    try {
      await supabase
        .from('carousel_templates')
        .insert({
          user_id: user.id,
          name: carouselContent.first_page_title.slice(0, 60),
          content: carouselContent,
          design: selectedDesign,
        });
      loadSavedTemplates();
    } catch {}
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const { error: err } = await supabase
        .from('carousel_settings')
        .upsert({
          user_id: user.id,
          display_name: userProfile.name,
          handle: userProfile.handle,
          custom_cta_text: customCtaText,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (err) throw err;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setError('Ошибка сохранения настроек.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUserProfile(prev => ({ ...prev, avatarUrl: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateContent = (slideIndex: number, field: string, value: any) => {
    if (!carouselContent) return;
    const newContent = { ...carouselContent };
    if (slideIndex === 0) {
      if (field === 'title') newContent.first_page_title = value;
    } else if (slideIndex === slides.length - 1) {
      if (field === 'ctaTitle') newContent.call_to_action_page.title = value;
      if (field === 'ctaDescription') newContent.call_to_action_page.description = value;
    } else {
      const contentIndex = slideIndex - 1;
      if (newContent.content_pages[contentIndex]) {
        if (field === 'title') newContent.content_pages[contentIndex].title = value;
        if (field === 'body') newContent.content_pages[contentIndex].body = value;
        if (field === 'intro_paragraph') newContent.content_pages[contentIndex].intro_paragraph = value;
        if (field === 'points') newContent.content_pages[contentIndex].points = value;
        if (field === 'blockquote_text') newContent.content_pages[contentIndex].blockquote_text = value;
      }
    }
    setCarouselContent(newContent);
  };

  const callEdgeFunction = async (reqBody: Record<string, any>) => {
    const headers = await getAuthHeaders();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-carousel`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Generation failed');
    return result;
  };

  const handleGenerateTopic = async () => {
    setIsGeneratingTopic(true);
    setError(null);
    try {
      const result = await callEdgeFunction({ action: 'generate_topic', activity, contentStyle: 'practical' });
      setTopic(result.topic);
      setIsCustomTitle(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка генерации темы.');
    } finally {
      setIsGeneratingTopic(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic) return setError('Введите тему.');
    setIsLoading(true);
    setError(null);
    setCarouselContent(null);
    setIsGenerated(true);
    try {
      const content = await callEdgeFunction({
        action: 'generate_content',
        topic,
        numSlides,
        isCustomTitle,
        ctaType,
        customCtaText: ctaType === 'custom' ? customCtaText : undefined,
        contentStyle: 'practical',
      });
      if (isCustomTitle) content.first_page_title = topic;
      setCarouselContent(content);
      handleSaveCarouselDraft();
    } catch (err: any) {
      setError(err.message || 'Ошибка генерации контента.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadSlide = useCallback(async (index: number) => {
    const el = slideRefs.current[index];
    if (!el) return;
    try {
      const dataUrl = await toPng(el, { quality: 1.0, pixelRatio: 3 });
      const link = document.createElement('a');
      link.download = `slide-${index + 1}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Error downloading slide', e);
    }
  }, []);

  const slides: Slide[] = carouselContent
    ? [
        { type: 'first', title: carouselContent.first_page_title },
        ...carouselContent.content_pages.map((page) => ({ type: 'content' as const, ...page })),
        { type: 'cta', ...carouselContent.call_to_action_page },
      ]
    : [];

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[600px]">
      <div className="w-full lg:w-[380px] shrink-0 space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">AI Carousel</h3>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSaving || !settingsLoaded}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600">Сохранено</span>
                </>
              ) : isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Сохранить
                </>
              )}
            </button>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center cursor-pointer overflow-hidden border border-slate-300 group relative"
                onClick={() => fileInputRef.current?.click()}
              >
                {userProfile.avatarUrl ? (
                  <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Upload className="w-5 h-5 text-white" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Upload className="w-4 h-4 text-white" />
                </div>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
              <div className="flex-1 space-y-1">
                <input
                  value={userProfile.name}
                  onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                  className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 text-sm font-medium focus:outline-none px-1 text-slate-900"
                  placeholder="Ваше имя"
                />
                <input
                  value={userProfile.handle}
                  onChange={(e) => setUserProfile({ ...userProfile, handle: e.target.value })}
                  className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 text-xs text-slate-500 focus:outline-none px-1"
                  placeholder="@username"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ниша</label>
            <input
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900"
              placeholder="SMM, Нутрициолог (или пусто для рандома)..."
            />
            <button
              type="button"
              onClick={handleGenerateTopic}
              disabled={isGeneratingTopic}
              className="w-full mt-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {isGeneratingTopic ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Dice5 className="w-4 h-4" />
                  {activity ? 'Придумать тему для этой ниши' : 'Случайная тема'}
                </>
              )}
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Тема</label>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setIsCustomTitle(false)}
                  className={`px-2 py-0.5 text-[10px] rounded-md transition-all font-medium ${!isCustomTitle ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Идея
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomTitle(true)}
                  className={`px-2 py-0.5 text-[10px] rounded-md transition-all font-medium ${isCustomTitle ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Готовый заголовок
                </button>
              </div>
            </div>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none h-20 text-slate-900"
              placeholder={isCustomTitle ? 'Вставьте готовый заголовок...' : 'О чем пишем? (AI придумает заголовок)'}
            />
          </div>



          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Слайдов</label>
              <select
                value={numSlides}
                onChange={(e) => setNumSlides(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none cursor-pointer text-slate-900"
              >
                {[3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <option key={num} value={num}>{num} слайдов</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Тип финала</label>
              <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setCtaType('custom')}
                  className={`flex-1 py-1.5 text-[10px] rounded font-medium transition-all ${ctaType === 'custom' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Свой текст
                </button>
                <button
                  type="button"
                  onClick={() => setCtaType('subscribe')}
                  className={`flex-1 py-1.5 text-[10px] rounded font-medium transition-all ${ctaType === 'subscribe' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Подписка
                </button>
              </div>
            </div>
          </div>

          {ctaType === 'custom' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Текст призыва (CTA)</label>
              <textarea
                value={customCtaText}
                onChange={(e) => setCustomCtaText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none h-16 text-slate-900"
                placeholder="Напиши ГАЙД в директ, чтобы получить бесплатный чек-лист..."
              />
              <p className="text-[10px] text-slate-400">Сохранится при нажатии "Сохранить" вверху</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:scale-100"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Генерация...</span>
              </div>
            ) : (
              'Сгенерировать'
            )}
          </button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>
          )}
        </div>

        {carouselContent && accounts.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Сохранить в шаблоны</p>
            {accounts.length > 1 && (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-900"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>@{a.username}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleSaveToThreadTemplates}
              disabled={isSavingToTemplates}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-lg ${
                savedToTemplates
                  ? 'bg-emerald-600 shadow-emerald-600/20 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 shadow-slate-900/20 text-white'
              }`}
            >
              {isSavingToTemplates ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Рендеринг слайдов...</span>
                </>
              ) : savedToTemplates ? (
                <>
                  <Check className="w-5 h-5" />
                  Сохранено в шаблоны
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Сохранить для публикации
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-400 text-center">Слайды конвертируются в изображения и сохраняются в раздел "Шаблоны"</p>
          </div>
        )}

        {savedTemplates.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Черновики каруселей</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{savedTemplates.length}</span>
              </div>
              <span className={`text-slate-400 text-xs transition-transform ${showTemplates ? 'rotate-180' : ''}`}>
                &#9660;
              </span>
            </button>
            {showTemplates && (
              <div className="border-t border-slate-100 max-h-64 overflow-y-auto">
                {savedTemplates.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 group">
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate(t)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm text-slate-800 font-medium truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(t.created_at).toLocaleDateString('ru-RU')}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {!isGenerated && carouselContent && (
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Предпросмотр</h2>
            <p className="text-slate-500 text-sm">Кликните на текст слайда, чтобы отредактировать.</p>
          </div>
        )}

        {isLoading && !carouselContent && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
              <p className="text-slate-500 text-sm">AI генерирует карусель...</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-8 pb-10">
          {slides.map((slide, index) => (
            <div key={index} className="group relative">
              <div
                ref={(el) => { slideRefs.current[index] = el; }}
                className="transition-transform duration-300 shadow-2xl group-hover:scale-[1.01]"
              >
                <CarouselSlide
                  design={selectedDesign}
                  userProfile={userProfile}
                  isFirstPage={slide.type === 'first'}
                  isCtaPage={slide.type === 'cta'}
                  title={slide.type !== 'cta' ? slide.title : undefined}
                  body={slide.type === 'content' ? slide.body : undefined}
                  intro_paragraph={slide.type === 'content' ? slide.intro_paragraph : undefined}
                  points={slide.type === 'content' ? slide.points : undefined}
                  blockquote_text={slide.type === 'content' ? slide.blockquote_text : undefined}
                  ctaTitle={slide.type === 'cta' ? slide.title : undefined}
                  ctaDescription={slide.type === 'cta' ? slide.description : undefined}
                  slideIndex={index}
                  totalSlides={slides.length}
                  onUpdateContent={(field, value) => handleUpdateContent(index, field, value)}
                />
              </div>
              <button
                type="button"
                onClick={() => handleDownloadSlide(index)}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> PNG
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
