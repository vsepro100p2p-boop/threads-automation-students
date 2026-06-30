import { useState } from 'react';
import { X, Send, Users, Loader2, CheckCircle } from 'lucide-react';
import { supabase, getSupabaseUrl, getAuthHeaders } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { logActivity } from '../lib/activityLogger';

interface Template {
  id: string;
  name: string;
  content: string[];
  media_urls?: string[];
  threads_account_id: string;
}

interface ThreadsAccount {
  id: string;
  username: string;
}

interface CrossPublishModalProps {
  template: Template;
  accounts: ThreadsAccount[];
  userId: string;
  onClose: () => void;
  onDone: () => void;
}

export default function CrossPublishModal({ template, accounts, userId, onClose, onDone }: CrossPublishModalProps) {
  const { showToast } = useToast();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<Map<string, 'pending' | 'success' | 'error'>>(new Map());

  const otherAccounts = accounts.filter(a => a.id !== template.threads_account_id);

  const toggleAccount = (id: string) => {
    const next = new Set(selectedAccounts);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAccounts(next);
  };

  const selectAll = () => {
    if (selectedAccounts.size === otherAccounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(otherAccounts.map(a => a.id)));
    }
  };

  const publish = async () => {
    if (selectedAccounts.size === 0) {
      showToast('Выберите хотя бы один аккаунт', 'warning');
      return;
    }

    setPublishing(true);
    const newResults = new Map<string, 'pending' | 'success' | 'error'>();
    selectedAccounts.forEach(id => newResults.set(id, 'pending'));
    setResults(newResults);

    let successCount = 0;

    for (const accountId of selectedAccounts) {
      try {
        const headers = await getAuthHeaders();
        const hasImages = template.media_urls && template.media_urls.length > 0;

        const response = await fetch(`${getSupabaseUrl()}/functions/v1/publish-to-threads`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            accountId,
            content: template.content,
            mediaUrls: template.media_urls || [],
            isThread: !hasImages && template.content.length > 1,
            isCarousel: hasImages,
          }),
        });

        if (!response.ok) throw new Error('Publish failed');

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Publish failed');

        await supabase.from('posts').insert({
          user_id: userId,
          threads_account_id: accountId,
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

        newResults.set(accountId, 'success');
        setResults(new Map(newResults));
        successCount++;
      } catch {
        newResults.set(accountId, 'error');
        setResults(new Map(newResults));
      }
    }

    const account = accounts.find(a => a.id === template.threads_account_id);
    logActivity(userId, 'cross_publish', {
      entityType: 'template',
      entityId: template.id,
      details: {
        templateName: template.name,
        targetAccounts: selectedAccounts.size,
        successCount,
      },
      accountUsername: account?.username,
    });

    if (successCount === selectedAccounts.size) {
      showToast(`Опубликовано в ${successCount} аккаунтов`, 'success');
    } else {
      showToast(`Опубликовано: ${successCount}/${selectedAccounts.size}`, successCount > 0 ? 'warning' : 'error');
    }

    setPublishing(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Кросс-публикация</h3>
              <p className="text-xs text-slate-500">{template.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {otherAccounts.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Нет других аккаунтов для кросс-публикации</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Выберите аккаунты:</p>
                <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  {selectedAccounts.size === otherAccounts.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {otherAccounts.map(account => {
                  const status = results.get(account.id);
                  return (
                    <label
                      key={account.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${
                        selectedAccounts.has(account.id) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAccounts.has(account.id)}
                        onChange={() => toggleAccount(account.id)}
                        disabled={publishing}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-800 flex-1">@{account.username}</span>
                      {status === 'pending' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                      {status === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {status === 'error' && <X className="w-4 h-4 text-red-500" />}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {otherAccounts.length > 0 && (
          <div className="flex gap-3 p-5 border-t border-slate-200">
            <button
              onClick={publish}
              disabled={publishing || selectedAccounts.size === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl transition font-medium"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Публикация...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Опубликовать ({selectedAccounts.size})
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={publishing}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-medium"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
