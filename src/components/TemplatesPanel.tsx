import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Send, Calendar as CalendarIcon, Play, X, Sparkles, FileText, Clock, CheckCircle, AlertTriangle, Image, Link, Upload, Download, Loader2, Users, Copy, FolderInput, ImageIcon } from 'lucide-react';
import { supabase, getAuthHeaders } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { logActivity } from '../lib/activityLogger';
import ScheduleCalendar from './ScheduleCalendar';
import TemplateFolders from './TemplateFolders';
import CrossPublishModal from './CrossPublishModal';
import MediaLibrary from './MediaLibrary';

const THREADS_CHAR_LIMIT = 500;

interface Template {
  id: string;
  name: string;
  content: string[];
  media_urls: string[];
  frequency_days: number;
  last_used_at: string | null;
  next_use_at: string | null;
  is_active: boolean;
  use_count: number;
  threads_account_id: string;
  folder_id: string | null;
}

interface ThreadsAccount {
  id: string;
  username: string;
  access_token: string;
  threads_user_id: string;
}

interface TemplatesPanelProps {
  selectedAccountId?: string | null;
  isActive?: boolean;
}

function CharacterCounter({ current, limit }: { current: number; limit: number }) {
  const percentage = Math.min((current / limit) * 100, 100);
  const isOverLimit = current > limit;
  const isNearLimit = current >= limit * 0.9;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOverLimit
              ? 'bg-red-500'
              : isNearLimit
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${
        isOverLimit
          ? 'text-red-600'
          : isNearLimit
          ? 'text-amber-600'
          : 'text-slate-400'
      }`}>
        {current}/{limit}
      </span>
    </div>
  );
}

export default function TemplatesPanel({ selectedAccountId, isActive }: TemplatesPanelProps) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [accounts, setAccounts] = useState<ThreadsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  const [testPublishing, setTestPublishing] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [batchInterval, setBatchInterval] = useState(60);
  const [batchStartHour, setBatchStartHour] = useState(10);
  const [batchEndHour, setBatchEndHour] = useState(20);
  const [batchAlwaysActive, setBatchAlwaysActive] = useState(false);
  const [activeBatches, setActiveBatches] = useState<any[]>([]);
  const [aiParsingText, setAiParsingText] = useState('');
  const [showAiParser, setShowAiParser] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const lastLoadTime = useRef<number>(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [crossPublishTemplate, setCrossPublishTemplate] = useState<Template | null>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
    isDanger?: boolean;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const showConfirm = (
    title: string,
    message: string,
    confirmText: string,
    onConfirm: () => void,
    isDanger = false
  ) => {
    setConfirmConfig({ title, message, confirmText, onConfirm, isDanger });
  };

  const [formData, setFormData] = useState({
    name: '',
    threads_account_id: selectedAccountId || '',
    content: [''],
    media_urls: [] as string[],
    frequency_days: 7,
    is_active: true,
    folder_id: null as string | null,
  });

  useEffect(() => {
    if (selectedAccountId && !editingTemplate) {
      setFormData(prev => ({ ...prev, threads_account_id: selectedAccountId }));
    }
  }, [selectedAccountId, editingTemplate]);

  const loadFolders = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('template_folders')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setFolders(data || []);
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  }, [user]);

  const loadTemplates = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('thread_templates')
        .select('*');

      if (selectedAccountId) {
        query = query.eq('threads_account_id', selectedAccountId);
      }

      if (selectedFolderId !== null) {
        query = query.eq('folder_id', selectedFolderId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedAccountId, selectedFolderId]);

  const loadAccounts = useCallback(async () => {
    if (!user) return;

    const now = Date.now();
    if (now - lastLoadTime.current < 2000) {
      return;
    }
    lastLoadTime.current = now;

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
  }, [user]);

  const loadActiveBatches = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('batch_publishes')
        .select('*')
        .in('status', ['pending', 'in_progress']);

      if (selectedAccountId) {
        query = query.eq('account_id', selectedAccountId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setActiveBatches(data || []);
    } catch (error) {
      console.error('Error loading batches:', error);
    }
  }, [user, selectedAccountId]);

  useEffect(() => {
    if (user && (isActive === undefined || isActive)) {
      loadFolders();
      loadTemplates();
      loadAccounts();
      loadActiveBatches();
    }
  }, [user, isActive, loadFolders, loadTemplates, loadAccounts, loadActiveBatches]);

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      threads_account_id: selectedAccountId || accounts[0]?.id || '',
      content: [''],
      media_urls: [],
      frequency_days: 7,
      is_active: true,
      folder_id: null,
    });
    setShowCreateModal(true);
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      threads_account_id: template.threads_account_id,
      content: template.content,
      media_urls: template.media_urls || [],
      frequency_days: template.frequency_days,
      is_active: template.is_active,
      folder_id: template.folder_id,
    });
    setShowCreateModal(true);
  };

  const generateTemplateName = () => {
    const now = new Date();
    const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `Шаблон ${date} ${time}`;
  };

  const handleSaveTemplate = async () => {
    try {
      const cleanContent = formData.content.filter(c => c.trim() !== '');

      if (cleanContent.length === 0) {
        showToast('Добавьте хотя бы один пост', 'warning');
        return;
      }

      const hasOverLimit = cleanContent.some(c => c.length > THREADS_CHAR_LIMIT);
      if (hasOverLimit) {
        showToast(`Один или несколько постов превышают лимит в ${THREADS_CHAR_LIMIT} символов`, 'warning');
        return;
      }

      const templateName = formData.name.trim() || generateTemplateName();

      const cleanMediaUrls = formData.media_urls.filter(url => url.trim() !== '');

      const templateData = {
        name: templateName,
        threads_account_id: selectedAccountId || formData.threads_account_id,
        content: cleanContent,
        media_urls: cleanMediaUrls,
        frequency_days: formData.frequency_days,
        is_active: formData.is_active,
        folder_id: formData.folder_id,
        user_id: user?.id,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('thread_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('thread_templates')
          .insert([templateData]);

        if (error) throw error;
      }

      setShowCreateModal(false);
      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      showToast('Ошибка при сохранении шаблона', 'error');
    }
  };

  const handleDeleteTemplate = (id: string) => {
    showConfirm(
      'Удалить этот шаблон?',
      'Этот шаблон будет безвозвратно удален из вашей библиотеки.',
      'Удалить',
      async () => {
        try {
          const { error } = await supabase
            .from('thread_templates')
            .delete()
            .eq('id', id);

          if (error) throw error;
          showToast('Шаблон удален', 'success');
          loadTemplates();
        } catch (error) {
          console.error('Error deleting template:', error);
          showToast('Ошибка при удалении шаблона', 'error');
        }
      },
      true
    );
  };

  const toggleTemplateActive = async (template: Template) => {
    try {
      const { error } = await supabase
        .from('thread_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;
      loadTemplates();
    } catch (error) {
      console.error('Error toggling template:', error);
    }
  };

  const toggleExpanded = (templateId: string) => {
    const newExpanded = new Set(expandedTemplates);
    if (newExpanded.has(templateId)) {
      newExpanded.delete(templateId);
    } else {
      newExpanded.add(templateId);
    }
    setExpandedTemplates(newExpanded);
  };

  const testPublishTemplate = (template: Template) => {
    showConfirm(
      'Опубликовать этот шаблон сейчас?',
      'Пост будет отправлен и опубликован в вашем аккаунте Threads прямо сейчас.',
      'Опубликовать',
      async () => {
        setTestPublishing(template.id);
        try {
          const account = accounts.find(a => a.id === template.threads_account_id);
          if (!account) throw new Error('Аккаунт не найден');

          const headers = await getAuthHeaders();

          const hasImages = template.media_urls && template.media_urls.length > 0;

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-threads`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({
                userId: account.threads_user_id,
                accessToken: account.access_token,
                texts: template.content,
                mediaUrls: hasImages ? template.media_urls : undefined,
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error:', errorText);
            throw new Error(`Ошибка публикации: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          console.log('Publish result:', result);

          if (!result.success) {
            throw new Error(result.error || 'Публикация не удалась');
          }

          await supabase.from('posts').insert({
            user_id: user?.id,
            threads_account_id: template.threads_account_id,
            content: template.content[0],
            thread_content: template.content,
            media_urls: template.media_urls || [],
            is_thread: !hasImages && template.content.length > 1,
            status: 'published',
            threads_post_id: result.postId,
            threads_post_url: result.url,
            published_at: new Date().toISOString(),
            generated_by_ai: false,
          });

          await supabase
            .from('thread_templates')
            .update({ use_count: template.use_count + 1 })
            .eq('id', template.id);

          showToast(`Шаблон опубликован! URL: ${result.url}`, 'success');
          loadTemplates();
        } catch (error: any) {
          console.error('Error publishing:', error);
          showToast(`Ошибка при публикации: ${error.message}`, 'error');
        } finally {
          setTestPublishing(null);
        }
      }
    );
  };

  const toggleTemplateSelection = (templateId: string) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedTemplates(newSelected);
  };

  const startBatchPublish = async () => {
    if (selectedTemplates.size === 0) {
      showToast('Выберите хотя бы один шаблон', 'warning');
      return;
    }

    const selectedTemplatesList = templates.filter(t => selectedTemplates.has(t.id));
    const accountId = selectedTemplatesList[0]?.threads_account_id;

    if (!accountId) {
      showToast('Не найден аккаунт для публикации', 'warning');
      return;
    }

    const allSameAccount = selectedTemplatesList.every(t => t.threads_account_id === accountId);
    if (!allSameAccount) {
      showToast('Все шаблоны должны быть для одного аккаунта', 'warning');
      return;
    }

    try {
      const { error } = await supabase
        .from('batch_publishes')
        .insert({
          user_id: user?.id,
          account_id: accountId,
          template_ids: Array.from(selectedTemplates),
          interval_minutes: batchInterval,
          status: 'pending',
          current_index: 0,
          next_publish_at: new Date().toISOString(),
          start_hour: batchAlwaysActive ? null : batchStartHour,
          end_hour: batchAlwaysActive ? null : batchEndHour,
        })
        .select()
        .single();

      if (error) throw error;

      showToast(`Запущена пакетная публикация ${selectedTemplates.size} шаблонов с интервалом ${batchInterval} мин`, 'success');
      setShowBatchModal(false);
      setSelectedTemplates(new Set());
      setBatchAlwaysActive(false);
      setBatchStartHour(10);
      setBatchEndHour(20);
      loadActiveBatches();
    } catch (error) {
      console.error('Error starting batch:', error);
      showToast('Ошибка при запуске пакетной публикации', 'error');
    }
  };

  const cancelBatch = (batchId: string) => {
    showConfirm(
      'Отменить пакетную публикацию?',
      'Все запланированные в этом пакете посты будут отменены.',
      'Отменить публикацию',
      async () => {
        try {
          const { error } = await supabase
            .from('batch_publishes')
            .update({ status: 'cancelled' })
            .eq('id', batchId);

          if (error) throw error;
          loadActiveBatches();
        } catch (error) {
          console.error('Error cancelling batch:', error);
        }
      },
      true
    );
  };

  const toggleSelectAll = () => {
    if (selectedTemplates.size === templates.length) {
      setSelectedTemplates(new Set());
    } else {
      setSelectedTemplates(new Set(templates.map(t => t.id)));
    }
  };

  const bulkDeleteTemplates = () => {
    if (selectedTemplates.size === 0) return;
    showConfirm(
      'Удалить выбранные шаблоны?',
      `Вы действительно хотите удалить ${selectedTemplates.size} выбранных шаблонов? Это действие необратимо.`,
      'Удалить всё',
      async () => {
        try {
          const { error } = await supabase
            .from('thread_templates')
            .delete()
            .in('id', Array.from(selectedTemplates));

          if (error) throw error;

          if (user) {
            logActivity(user.id, 'templates_bulk_deleted', {
              entityType: 'template',
              details: { count: selectedTemplates.size },
            });
          }
          showToast(`Удалено ${selectedTemplates.size} шаблонов`, 'success');
          setSelectedTemplates(new Set());
          loadTemplates();
        } catch (error) {
          console.error('Error bulk deleting:', error);
          showToast('Ошибка при удалении шаблонов', 'error');
        }
      },
      true
    );
  };

  const bulkMoveToFolder = async (folderId: string | null) => {
    if (selectedTemplates.size === 0) return;

    try {
      const { error } = await supabase
        .from('thread_templates')
        .update({ folder_id: folderId })
        .in('id', Array.from(selectedTemplates));

      if (error) throw error;

      if (user) {
        logActivity(user.id, 'templates_bulk_moved', {
          entityType: 'template',
          details: { count: selectedTemplates.size, folderId },
        });
      }
      const folderName = folderId ? folders.find(f => f.id === folderId)?.name || 'папку' : 'корень';
      showToast(`Перемещено ${selectedTemplates.size} шаблонов в ${folderName}`, 'success');
      setSelectedTemplates(new Set());
      setShowBulkMoveModal(false);
      loadTemplates();
    } catch (error) {
      console.error('Error bulk moving:', error);
      showToast('Ошибка при перемещении шаблонов', 'error');
    }
  };

  const duplicateTemplate = async (template: Template) => {
    try {
      const { error } = await supabase
        .from('thread_templates')
        .insert({
          user_id: user?.id,
          threads_account_id: template.threads_account_id,
          name: `${template.name} (копия)`,
          content: template.content,
          media_urls: template.media_urls,
          frequency_days: template.frequency_days,
          is_active: false,
          folder_id: template.folder_id,
        });

      if (error) throw error;

      if (user) {
        logActivity(user.id, 'template_duplicated', {
          entityType: 'template',
          entityId: template.id,
          details: { name: template.name },
        });
      }
      showToast('Шаблон скопирован', 'success');
      loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      showToast('Ошибка при копировании шаблона', 'error');
    }
  };

  const handleMediaLibrarySelect = (urls: string[]) => {
    setFormData(prev => ({
      ...prev,
      media_urls: [...prev.media_urls.filter(u => u.trim()), ...urls]
    }));
    setShowMediaLibrary(false);
  };

  const addContentField = () => {
    setFormData({ ...formData, content: [...formData.content, ''] });
  };

  const updateContentField = (index: number, value: string) => {
    const newContent = [...formData.content];
    newContent[index] = value;
    setFormData({ ...formData, content: newContent });
  };

  const removeContentField = (index: number) => {
    const newContent = formData.content.filter((_, i) => i !== index);
    setFormData({ ...formData, content: newContent });
  };

  const addMediaUrl = () => {
    setFormData({ ...formData, media_urls: [...formData.media_urls, ''] });
  };

  const updateMediaUrl = (index: number, value: string) => {
    const newUrls = [...formData.media_urls];
    newUrls[index] = value;
    setFormData({ ...formData, media_urls: newUrls });
  };

  const removeMediaUrl = async (index: number) => {
    const urlToRemove = formData.media_urls[index];

    if (urlToRemove && urlToRemove.includes('template-images') && user) {
      try {
        const urlParts = urlToRemove.split('/template-images/');
        if (urlParts[1]) {
          const filePath = decodeURIComponent(urlParts[1]);
          await supabase.storage.from('template-images').remove([filePath]);
        }
      } catch (err) {
        console.error('Error deleting file from storage:', err);
      }
    }

    const newUrls = formData.media_urls.filter((_, i) => i !== index);
    setFormData({ ...formData, media_urls: newUrls });
  };

  const uploadImages = async (files: FileList | File[]) => {
    if (!user) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        showToast(`${file.name}: неподдерживаемый формат. Используйте JPEG, PNG, WebP или GIF.`, 'warning');
        return false;
      }
      if (file.size > 8 * 1024 * 1024) {
        showToast(`${file.name}: файл слишком большой. Максимум 8MB.`, 'warning');
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const currentCount = formData.media_urls.filter(u => u.trim()).length;
    if (currentCount + validFiles.length > 20) {
      showToast(`Можно добавить максимум 20 изображений. Сейчас: ${currentCount}, пытаетесь добавить: ${validFiles.length}`, 'warning');
      return;
    }

    setUploadingImages(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of validFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('template-images')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('template-images')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      setFormData(prev => ({
        ...prev,
        media_urls: [...prev.media_urls.filter(u => u.trim()), ...uploadedUrls]
      }));
    } catch (error: any) {
      console.error('Error uploading images:', error);
      showToast(`Ошибка загрузки: ${error.message}`, 'error');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadImages(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadImages(e.target.files);
      e.target.value = '';
    }
  };

  const parseWithAI = async () => {
    if (!aiParsingText.trim()) {
      showToast('Введите текст для разбора', 'warning');
      return;
    }

    setAiParsing(true);
    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-text-ai`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: aiParsingText }),
        }
      );

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

      if (Array.isArray(result.posts) && result.posts.length > 0) {
        setFormData({ ...formData, content: result.posts });
        setShowAiParser(false);
        setAiParsingText('');
      } else {
        throw new Error('AI вернул пустой результат');
      }
    } catch (error: any) {
      console.error('AI parsing error:', error);
      showToast(`Ошибка разбора: ${error.message}`, 'error');
    } finally {
      setAiParsing(false);
    }
  };

  const exportTemplates = () => {
    const exportData = templates.map(t => ({
      name: t.name,
      content: t.content,
      media_urls: t.media_urls,
      frequency_days: t.frequency_days,
      is_active: t.is_active,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (user) {
      logActivity(user.id, 'templates_exported', {
        entityType: 'template',
        details: { count: exportData.length },
      });
    }
    showToast(`Экспортировано ${exportData.length} шаблонов`, 'success');
  };

  const importTemplates = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';

    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Неверный формат файла');

      const defaultAccountId = selectedAccountId || accounts[0]?.id;
      if (!defaultAccountId) {
        showToast('Добавьте хотя бы один аккаунт перед импортом', 'warning');
        setIsImporting(false);
        return;
      }

      let imported = 0;
      for (const item of data) {
        if (!item.name || !Array.isArray(item.content)) continue;
        const { error } = await supabase.from('thread_templates').insert({
          user_id: user.id,
          threads_account_id: defaultAccountId,
          name: item.name,
          content: item.content,
          media_urls: item.media_urls || [],
          frequency_days: item.frequency_days || 7,
          is_active: item.is_active !== false,
        });
        if (!error) imported++;
      }

      logActivity(user.id, 'templates_imported', {
        entityType: 'template',
        details: { count: imported },
      });
      showToast(`Импортировано ${imported} шаблонов`, 'success');
      loadTemplates();
    } catch {
      showToast('Ошибка при импорте файла. Проверьте формат JSON.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const getTotalChars = () => formData.content.reduce((sum, c) => sum + c.length, 0);
  const getOverLimitCount = () => formData.content.filter(c => c.length > THREADS_CHAR_LIMIT).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Шаблоны тредов</h2>
          <p className="text-sm text-slate-500 mt-1">
            {templates.length} {templates.length === 1 ? 'шаблон' : templates.length < 5 ? 'шаблона' : 'шаблонов'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition text-sm font-medium"
            >
              {selectedTemplates.size === templates.length ? 'Снять все' : 'Выбрать все'}
            </button>
          )}
          <button
            onClick={exportTemplates}
            disabled={templates.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Экспорт шаблонов"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition text-sm font-medium"
            title="Импорт шаблонов"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={importTemplates}
            className="hidden"
          />
          <button
            onClick={() => setShowCalendar(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition text-sm font-medium"
          >
            <CalendarIcon className="w-4 h-4" />
            Календарь
          </button>
          {selectedTemplates.size > 0 && (
            <>
              <button
                onClick={() => setShowBulkMoveModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition text-sm font-medium"
              >
                <FolderInput className="w-4 h-4" />
                В папку
              </button>
              <button
                onClick={bulkDeleteTemplates}
                className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Удалить ({selectedTemplates.size})
              </button>
              <button
                onClick={() => setShowBatchModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition text-sm font-medium"
              >
                <Play className="w-4 h-4" />
                Запустить ({selectedTemplates.size})
              </button>
            </>
          )}
          <button
            onClick={handleCreateTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Создать шаблон
          </button>
        </div>
      </div>

      <TemplateFolders
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
      />

      {activeBatches.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-slate-900 font-semibold mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            Активные публикации
          </h3>
          <div className="space-y-2">
            {activeBatches.map((batch) => (
              <div key={batch.id} className="bg-white rounded-lg p-3 flex justify-between items-center border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Play className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-slate-900 font-medium">
                      {batch.current_index + 1} / {batch.template_ids.length} шаблонов
                    </p>
                    <p className="text-sm text-slate-500">
                      Интервал: {batch.interval_minutes} мин
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => cancelBatch(batch.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-slate-200">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-900 font-semibold mb-1">Пока нет шаблонов</p>
          <p className="text-slate-500 text-sm mb-6">
            Создайте первый шаблон для автоматической публикации
          </p>
          <button
            onClick={handleCreateTemplate}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
          >
            Создать первый шаблон
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((template) => {
            const totalChars = template.content.reduce((sum, c) => sum + c.length, 0);
            const hasOverLimit = template.content.some(c => c.length > THREADS_CHAR_LIMIT);
            const hasImages = template.media_urls && template.media_urls.length > 0;

            return (
              <div
                key={template.id}
                className={`bg-white rounded-xl border overflow-hidden transition ${
                  selectedTemplates.has(template.id)
                    ? 'border-blue-400 ring-2 ring-blue-100'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={selectedTemplates.has(template.id)}
                          onChange={() => toggleTemplateSelection(template.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        onClick={() => toggleExpanded(template.id)}
                        className="flex items-start gap-3 flex-1 text-left min-w-0"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          template.is_active
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600'
                            : 'bg-slate-200'
                        }`}>
                          {expandedTemplates.has(template.id) ? (
                            <ChevronDown className="w-5 h-5 text-white" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-slate-900 truncate">
                              {template.name}
                            </h3>
                            {template.is_active ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">
                                <CheckCircle className="w-3 h-3" />
                                Активен
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                                <Clock className="w-3 h-3" />
                                Неактивен
                              </span>
                            )}
                            {hasOverLimit && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                Превышен лимит
                              </span>
                            )}
                            {hasImages && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full font-medium">
                                <Image className="w-3 h-3" />
                                {template.media_urls.length} фото
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5" />
                              {template.content.length} {template.content.length === 1 ? 'пост' : 'постов'}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span>{totalChars} символов</span>
                            <span className="text-slate-300">|</span>
                            <span>Публикаций: {template.use_count}</span>
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          testPublishTemplate(template);
                        }}
                        disabled={testPublishing === template.id || hasOverLimit}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Опубликовать сейчас"
                      >
                        {testPublishing === template.id ? (
                          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                      {accounts.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCrossPublishTemplate(template);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Кросс-публикация"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTemplateActive(template);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                        title={template.is_active ? 'Деактивировать' : 'Активировать'}
                      >
                        {template.is_active ? (
                          <ToggleRight className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateTemplate(template);
                        }}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition"
                        title="Дублировать"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTemplate(template);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Редактировать"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(template.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {expandedTemplates.has(template.id) && (
                    <div className="mt-4 ml-7 space-y-3">
                      {template.content.map((post, idx) => {
                        const isOverLimit = post.length > THREADS_CHAR_LIMIT;
                        return (
                          <div key={idx} className="relative">
                            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-full ${
                              isOverLimit ? 'bg-red-400' : 'bg-blue-400'
                            }`} />
                            <div className={`ml-4 rounded-xl p-4 border ${
                              isOverLimit
                                ? 'bg-red-50 border-red-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-xs font-semibold ${
                                  isOverLimit ? 'text-red-600' : 'text-blue-600'
                                }`}>
                                  {idx === 0 ? 'Главный пост' : `Ответ ${idx}`}
                                </span>
                                <span className={`text-xs font-medium ${
                                  isOverLimit ? 'text-red-600' : 'text-slate-400'
                                }`}>
                                  {post.length}/{THREADS_CHAR_LIMIT}
                                </span>
                              </div>
                              <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{post}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingTemplate ? 'Редактировать шаблон' : 'Новый шаблон'}
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {formData.content.length > 0 && (
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className="text-slate-500">
                    {formData.content.filter(c => c.trim()).length} постов
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500">
                    {getTotalChars()} символов
                  </span>
                  {getOverLimitCount() > 0 && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span className="text-red-600 font-medium">
                        {getOverLimitCount()} превышает лимит
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Название шаблона
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="Авто-название если пусто"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Папка (опционально)
                  </label>
                  <select
                    value={formData.folder_id || ''}
                    onChange={(e) => setFormData({ ...formData, folder_id: e.target.value || null })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  >
                    <option value="">Без папки</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Организуйте шаблоны в папки для удобства
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Содержание треда
                    </label>
                    <button
                      onClick={() => setShowAiParser(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition font-medium shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Парсинг
                    </button>
                  </div>

                  <div className="space-y-4">
                    {formData.content.map((content, index) => {
                      const charCount = content.length;
                      const isOverLimit = charCount > THREADS_CHAR_LIMIT;

                      return (
                        <div key={index} className={`relative rounded-xl border-2 transition ${
                          isOverLimit ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
                        }`}>
                          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                            <span className={`text-xs font-semibold ${
                              isOverLimit ? 'text-red-600' : 'text-blue-600'
                            }`}>
                              {index === 0 ? 'Главный пост' : `Ответ ${index}`}
                            </span>
                            <div className="flex items-center gap-2">
                              {formData.content.length > 1 && (
                                <button
                                  onClick={() => removeContentField(index)}
                                  className="p-1 text-slate-400 hover:text-red-500 rounded transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <textarea
                            value={content}
                            onChange={(e) => updateContentField(index, e.target.value)}
                            className={`w-full px-4 py-3 text-slate-900 min-h-[100px] focus:outline-none resize-none bg-transparent ${
                              isOverLimit ? 'text-red-900' : ''
                            }`}
                            placeholder={index === 0 ? 'Напишите главный пост треда...' : 'Напишите ответ в треде...'}
                          />
                          <div className="px-4 pb-3">
                            <CharacterCounter current={charCount} limit={THREADS_CHAR_LIMIT} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={addContentField}
                    className="mt-4 w-full py-3 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-xl text-slate-500 hover:text-blue-600 flex items-center justify-center gap-2 transition font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Добавить ответ в тред
                  </button>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-slate-700 flex items-center gap-2">
                      <Image className="w-4 h-4 text-teal-600" />
                      Изображения для карусели
                    </label>
                    <span className="text-xs text-slate-400">
                      {formData.media_urls.filter(u => u.trim()).length}/20 изображений
                    </span>
                  </div>

                  {formData.media_urls.some(u => u.trim()) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                      {formData.media_urls.map((url, originalIndex) => {
                        if (!url.trim()) return null;
                        return (
                          <div key={originalIndex} className="relative group aspect-square">
                            <img
                              src={url}
                              alt={`Image ${originalIndex + 1}`}
                              className="w-full h-full object-cover rounded-lg border border-slate-200"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="%23f1f5f9" width="100" height="100"/><text fill="%2394a3b8" font-size="12" x="50" y="50" text-anchor="middle" dy=".3em">Error</text></svg>';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                              <button
                                onClick={() => removeMediaUrl(originalIndex)}
                                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded font-medium">
                              {originalIndex + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => !uploadingImages && fileInputRef.current?.click()}
                    className={`w-full py-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition cursor-pointer ${
                      isDragging
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-slate-200 hover:border-teal-400 hover:bg-teal-50/50'
                    } ${uploadingImages ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {uploadingImages ? (
                      <>
                        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
                        <span className="text-sm text-teal-600 font-medium">Загрузка...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-slate-400" />
                        <span className="text-sm text-slate-600 font-medium">
                          Перетащите изображения сюда или нажмите для выбора
                        </span>
                        <span className="text-xs text-slate-400">
                          JPEG, PNG, WebP, GIF (макс. 8MB)
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setShowMediaLibrary(true)}
                      disabled={formData.media_urls.filter(u => u.trim()).length >= 20}
                      className="flex-1 py-2 border border-teal-200 bg-teal-50 hover:bg-teal-100 rounded-lg text-teal-700 flex items-center justify-center gap-2 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ImageIcon className="w-4 h-4" />
                      Из библиотеки
                    </button>
                    <button
                      onClick={addMediaUrl}
                      disabled={formData.media_urls.filter(u => u.trim()).length >= 20}
                      className="flex-1 py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg text-slate-600 flex items-center justify-center gap-2 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Link className="w-4 h-4" />
                      Добавить URL
                    </button>
                  </div>

                  {formData.media_urls.some(u => u && !u.startsWith('http')) && (
                    <div className="mt-3 space-y-2">
                      {formData.media_urls.map((url, index) => (
                        !url.startsWith('http') && url.trim() !== '' ? null : (
                          url === '' && (
                            <div key={index} className="flex gap-2">
                              <div className="flex-1 relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                  <Link className="w-4 h-4 text-slate-400" />
                                </div>
                                <input
                                  type="url"
                                  value={url}
                                  onChange={(e) => updateMediaUrl(index, e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                                  placeholder="https://example.com/image.jpg"
                                />
                              </div>
                              <button
                                onClick={() => removeMediaUrl(index)}
                                className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )
                        )
                      ))}
                    </div>
                  )}

                  {formData.media_urls.filter(u => u === '').length > 0 && (
                    <div className="mt-3 space-y-2">
                      {formData.media_urls.map((url, index) => (
                        url === '' && (
                          <div key={index} className="flex gap-2">
                            <div className="flex-1 relative">
                              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                <Link className="w-4 h-4 text-slate-400" />
                              </div>
                              <input
                                type="url"
                                value={url}
                                onChange={(e) => updateMediaUrl(index, e.target.value)}
                                className="w-full border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                                placeholder="https://example.com/image.jpg"
                              />
                            </div>
                            <button
                              onClick={() => removeMediaUrl(index)}
                              className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      ))}
                    </div>
                  )}

                  <div className="mt-3 bg-teal-50 border border-teal-100 rounded-xl p-3">
                    <p className="text-xs text-teal-700">
                      Карусель требует минимум 2 изображения (макс. 20). При наличии изображений текст станет подписью к карусели.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <div className="flex gap-3">
                <button
                  onClick={handleSaveTemplate}
                  disabled={getOverLimitCount() > 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-xl transition font-medium"
                >
                  {getOverLimitCount() > 0 ? 'Исправьте превышение лимита' : 'Сохранить шаблон'}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-3 rounded-xl transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAiParser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  AI Парсинг текста
                </h3>
                <button
                  onClick={() => {
                    setShowAiParser(false);
                    setAiParsingText('');
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Вставьте текст для разбора
                </label>
                <textarea
                  value={aiParsingText}
                  onChange={(e) => setAiParsingText(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 min-h-[250px] font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="Вставьте ваш текст с промптами, code блоками и т.д..."
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm text-slate-600">
                  AI автоматически разделит текст на посты (до {THREADS_CHAR_LIMIT} символов каждый), уберёт code блоки и лишнее форматирование
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <div className="flex gap-3">
                <button
                  onClick={parseWithAI}
                  disabled={aiParsing || !aiParsingText.trim()}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-xl transition flex items-center justify-center gap-2 font-medium"
                >
                  {aiParsing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Разбираю...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Разобрать с AI
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowAiParser(false);
                    setAiParsingText('');
                  }}
                  disabled={aiParsing}
                  className="px-6 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-700 py-3 rounded-xl transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCalendar && (
        <ScheduleCalendar
          onClose={() => setShowCalendar(false)}
          templates={templates.map(t => ({
            id: t.id,
            name: t.name,
            threads_account_id: t.threads_account_id
          }))}
        />
      )}

      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                  Пакетная публикация
                </h3>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-slate-700">
                  Выбрано шаблонов: <span className="font-bold text-slate-900">{selectedTemplates.size}</span>
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Шаблоны будут публиковаться по очереди
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Интервал между публикациями
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    value={batchInterval}
                    onChange={(e) => setBatchInterval(parseInt(e.target.value))}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <span className="text-slate-500 font-medium">минут</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Время работы
                </label>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchAlwaysActive}
                    onChange={(e) => setBatchAlwaysActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    Публиковать круглосуточно
                  </span>
                </label>
                {!batchAlwaysActive && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Начало</label>
                      <select
                        value={batchStartHour}
                        onChange={(e) => setBatchStartHour(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Конец</label>
                      <select
                        value={batchEndHour}
                        onChange={(e) => setBatchEndHour(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  {batchAlwaysActive
                    ? 'Посты будут публиковаться в любое время суток'
                    : 'Публикации будут только в указанные часы'}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-sm text-slate-700">
                  Общее время: <span className="font-bold text-slate-900">
                    ~{Math.floor((selectedTemplates.size * batchInterval) / 60)}ч {(selectedTemplates.size * batchInterval) % 60}м
                  </span>
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <div className="flex gap-3">
                <button
                  onClick={startBatchPublish}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white py-3 rounded-xl transition flex items-center justify-center gap-2 font-medium"
                >
                  <Play className="w-4 h-4" />
                  Запустить
                </button>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="px-6 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-3 rounded-xl transition font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {crossPublishTemplate && user && (
        <CrossPublishModal
          template={crossPublishTemplate}
          accounts={accounts}
          userId={user.id}
          onClose={() => setCrossPublishTemplate(null)}
          onDone={() => {
            setCrossPublishTemplate(null);
            loadTemplates();
          }}
        />
      )}

      {showBulkMoveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <FolderInput className="w-5 h-5 text-white" />
                  </div>
                  Переместить в папку
                </h3>
                <button
                  onClick={() => setShowBulkMoveModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-2">
              <p className="text-sm text-slate-600 mb-4">
                Выбрано шаблонов: <span className="font-bold text-slate-900">{selectedTemplates.size}</span>
              </p>
              <button
                onClick={() => bulkMoveToFolder(null)}
                className="w-full p-3 text-left rounded-xl border border-slate-200 hover:bg-slate-50 transition flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <span className="text-slate-700 font-medium">Без папки (корень)</span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => bulkMoveToFolder(folder.id)}
                  className="w-full p-3 text-left rounded-xl border border-slate-200 hover:bg-slate-50 transition flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: folder.color + '20' }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: folder.color }}
                    />
                  </div>
                  <span className="text-slate-700 font-medium">{folder.name}</span>
                </button>
              ))}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setShowBulkMoveModal(false)}
                className="w-full px-4 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaLibrary && (
        <MediaLibrary
          onClose={() => setShowMediaLibrary(false)}
          onSelect={handleMediaLibrarySelect}
          selectionMode={true}
          maxSelection={20 - formData.media_urls.filter(u => u.trim()).length}
        />
      )}

      {confirmConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
              confirmConfig.isDanger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {confirmConfig.isDanger ? (
                <Trash2 className="w-6 h-6" />
              ) : (
                <Sparkles className="w-6 h-6" />
              )}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">{confirmConfig.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{confirmConfig.message}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmConfig(null)}
                className="flex-1 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition shadow-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
                className={`flex-1 px-4 py-2.5 text-white text-sm font-semibold rounded-xl transition shadow-md ${
                  confirmConfig.isDanger
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-600/10'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/10'
                }`}
              >
                {confirmConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {isImporting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Импорт шаблонов</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Пожалуйста, подождите. Шаблоны загружаются в вашу базу данных...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
