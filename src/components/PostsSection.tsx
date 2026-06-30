import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { Clock, CheckCircle, XCircle, ExternalLink, Sparkles, Trash2, Check } from 'lucide-react';
import Pagination from './Pagination';

const PAGE_SIZE = 20;

interface Post {
  id: string;
  content: string;
  status: string;
  threads_post_url: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  generated_by_ai: boolean;
  error_message: string | null;
}

export function PostsSection({ onUpdate }: { onUpdate: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  useEffect(() => {
    loadPosts();
  }, [user, currentPage]);

  const loadPosts = async () => {
    if (!user) return;

    setLoading(true);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { count } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    setTotalCount(count || 0);

    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    setPosts(data || []);
    setLoading(false);
  };

  const togglePostSelection = (postId: string) => {
    const newSelected = new Set(selectedPosts);
    if (newSelected.has(postId)) {
      newSelected.delete(postId);
    } else {
      newSelected.add(postId);
    }
    setSelectedPosts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedPosts.size === posts.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(posts.map(p => p.id)));
    }
  };

  const bulkDeletePosts = async () => {
    if (selectedPosts.size === 0) return;
    if (!confirm(`Удалить ${selectedPosts.size} постов?`)) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .in('id', Array.from(selectedPosts));

      if (error) throw error;

      showToast(`Удалено ${selectedPosts.size} постов`, 'success');
      setSelectedPosts(new Set());
      setBulkMode(false);
      loadPosts();
      onUpdate();
    } catch (error) {
      console.error('Error bulk deleting posts:', error);
      showToast('Ошибка при удалении постов', 'error');
    }
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Удалить этот пост?')) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      showToast('Пост удален', 'success');
      loadPosts();
      onUpdate();
    } catch (error) {
      console.error('Error deleting post:', error);
      showToast('Ошибка при удалении поста', 'error');
    }
  };

  const getStatusBadge = (post: Post) => {
    switch (post.status) {
      case 'published':
        return (
          <span className="inline-flex items-center space-x-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            <span>Опубликовано</span>
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            <span>Запланировано</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <XCircle className="w-3 h-3" />
            <span>Ошибка</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
            <span>Черновик</span>
          </span>
        );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ru-RU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="text-center py-12">
        <Sparkles className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">Пока нет постов</h3>
        <p className="text-slate-600">
          Настройте ваш Threads аккаунт и AI для автоматической генерации постов.
        </p>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedPosts(new Set());
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              bulkMode
                ? 'bg-blue-100 text-blue-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {bulkMode ? 'Отменить' : 'Выбрать'}
          </button>
          {bulkMode && posts.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="px-3 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition"
            >
              {selectedPosts.size === posts.length ? 'Снять все' : 'Выбрать все'}
            </button>
          )}
        </div>
        {bulkMode && selectedPosts.size > 0 && (
          <button
            onClick={bulkDeletePosts}
            className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition"
          >
            <Trash2 className="w-4 h-4" />
            Удалить ({selectedPosts.size})
          </button>
        )}
      </div>

      {posts.map((post) => {
        const isSelected = selectedPosts.has(post.id);
        return (
          <div
            key={post.id}
            onClick={() => bulkMode && togglePostSelection(post.id)}
            className={`border rounded-lg p-6 transition ${
              bulkMode ? 'cursor-pointer' : ''
            } ${
              isSelected
                ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-100'
                : 'border-slate-200 hover:shadow-md'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-2">
                {bulkMode && (
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                )}
                {getStatusBadge(post)}
                {post.generated_by_ai && (
                  <span className="inline-flex items-center space-x-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">
                    <Sparkles className="w-3 h-3" />
                    <span>AI</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {post.threads_post_url && (
                  <a
                    href={post.threads_post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-slate-700 transition"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {!bulkMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePost(post.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-slate-900 mb-4 whitespace-pre-wrap leading-relaxed">
              {post.content}
            </p>

            <div className="flex items-center justify-between text-sm text-slate-500">
              <div className="flex items-center space-x-4">
                <span>Создан: {formatDate(post.created_at)}</span>
                {post.published_at && (
                  <span>Опубликован: {formatDate(post.published_at)}</span>
                )}
                {post.scheduled_for && (
                  <span>Запланирован: {formatDate(post.scheduled_for)}</span>
                )}
              </div>
            </div>

            {post.error_message && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {post.error_message}
              </div>
            )}
          </div>
        );
      })}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={totalCount}
        itemsPerPage={PAGE_SIZE}
      />
    </div>
  );
}
