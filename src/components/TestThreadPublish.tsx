import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Send, Plus, X, CheckCircle, AlertCircle } from 'lucide-react';

interface ThreadsAccount {
  id: string;
  username: string;
  access_token: string;
}

interface TestThreadPublishProps {
  account: ThreadsAccount;
}

export function TestThreadPublish({ account }: TestThreadPublishProps) {
  const [threadPosts, setThreadPosts] = useState<string[]>(['']);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string; data?: any } | null>(null);

  const addPost = () => {
    setThreadPosts([...threadPosts, '']);
  };

  const removePost = (index: number) => {
    setThreadPosts(threadPosts.filter((_, i) => i !== index));
  };

  const updatePost = (index: number, value: string) => {
    const updated = [...threadPosts];
    updated[index] = value;
    setThreadPosts(updated);
  };

  const publishThread = async () => {
    const cleanPosts = threadPosts.filter(p => p.trim());
    if (cleanPosts.length === 0) {
      setResult({ error: 'Добавьте хотя бы один пост с текстом' });
      return;
    }

    setPublishing(true);
    setResult(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Не удалось получить токен авторизации');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-thread-test`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: account.id,
          threadContent: cleanPosts,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка публикации');
      }

      setResult({ success: true, data });
      setThreadPosts(['']);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setPublishing(false);
    }
  };

  const validPostsCount = threadPosts.filter(p => p.trim()).length;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Тестовая публикация</h2>
        <p className="text-slate-500 mt-1">Проверьте работу публикации треда в аккаунт @{account.username}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <label className="text-sm font-medium text-slate-700">
            Посты треда
          </label>
          <span className="text-sm text-slate-500">
            {validPostsCount} {validPostsCount === 1 ? 'пост' : 'постов'}
          </span>
        </div>

        <div className="space-y-3 mb-6">
          {threadPosts.map((post, index) => (
            <div key={index} className="relative">
              <div className="absolute left-3 top-3 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-slate-600">{index + 1}</span>
              </div>
              <textarea
                value={post}
                onChange={(e) => updatePost(index, e.target.value)}
                rows={3}
                placeholder={index === 0 ? 'Главный пост треда...' : 'Продолжение треда...'}
                className="w-full pl-12 pr-10 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-slate-900 placeholder:text-slate-400"
              />
              {threadPosts.length > 1 && (
                <button
                  onClick={() => removePost(index)}
                  className="absolute right-2 top-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <div className="absolute right-3 bottom-3 text-xs text-slate-400">
                {post.length}/500
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addPost}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 text-slate-600 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition mb-6"
        >
          <Plus className="w-4 h-4" />
          <span>Добавить пост в тред</span>
        </button>

        <button
          onClick={publishThread}
          disabled={publishing || validPostsCount === 0}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          <Send className="w-5 h-5" />
          <span>{publishing ? 'Публикация...' : 'Опубликовать тред'}</span>
        </button>

        {result && (
          <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 ${
            result.error
              ? 'bg-red-50 border border-red-200'
              : 'bg-green-50 border border-green-200'
          }`}>
            {result.error ? (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${result.error ? 'text-red-800' : 'text-green-800'}`}>
                {result.error ? 'Ошибка публикации' : 'Тред опубликован!'}
              </p>
              <p className={`text-sm mt-1 ${result.error ? 'text-red-600' : 'text-green-600'}`}>
                {result.error || 'Проверьте ваш Threads аккаунт'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
