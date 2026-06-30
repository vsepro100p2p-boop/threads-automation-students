import { useState, useMemo, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { FileText, Sparkles, Zap, Settings, RefreshCw, Edit3, Trash2, CheckCircle, XCircle, Activity, Clock, AlertTriangle, Shield, Folder, LayoutGrid } from 'lucide-react';
import { supabase, getAuthHeaders, saveSecret } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { logActivity } from '../lib/activityLogger';
import TemplatesPanel from './TemplatesPanel';
import ViralThreadGenerator from './ViralThreadGenerator';
import AIAutoPosting from './AIAutoPosting';
import { TestThreadPublish } from './TestThreadPublish';
import CarouselGenerator from './carousel/CarouselGenerator';

interface ThreadsAccount {
  id: string;
  threads_user_id: string;
  username: string;
  is_active: boolean;
  token_expires_at: string | null;
  access_token: string;
  app_id: string | null;
  app_secret: string | null;
  folder_id: string | null;
  profile_picture_url: string | null;
  is_demo?: boolean;
}

interface AccountWorkspaceProps {
  account: ThreadsAccount;
  user: User;
  onAccountUpdate: () => void;
  onAccountDelete: () => void;
}

type WorkspaceTab = 'templates' | 'viral' | 'carousel' | 'autopost' | 'test' | 'settings';

export default function AccountWorkspace({ account, user, onAccountUpdate, onAccountDelete }: AccountWorkspaceProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('templates');
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tabs = useMemo(() => [
    { id: 'templates' as WorkspaceTab, label: 'Шаблоны', icon: FileText },
    { id: 'viral' as WorkspaceTab, label: 'AI Генератор', icon: Sparkles },
    { id: 'carousel' as WorkspaceTab, label: 'Карусели', icon: LayoutGrid },
    { id: 'autopost' as WorkspaceTab, label: 'Автопостинг', icon: Zap },
    { id: 'test' as WorkspaceTab, label: 'Тест', icon: Activity },
    { id: 'settings' as WorkspaceTab, label: 'Настройки', icon: Settings },
  ], []);

  const getTokenStatus = (expiresAt: string | null) => {
    if (!expiresAt) return { text: 'Не указан', status: 'unknown', daysLeft: null };

    const now = new Date();
    const expiry = new Date(expiresAt);
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { text: 'Истек', status: 'expired', daysLeft };
    } else if (daysLeft < 7) {
      return { text: `${daysLeft} дн.`, status: 'warning', daysLeft };
    } else {
      return { text: `${daysLeft} дн.`, status: 'ok', daysLeft };
    }
  };

  const tokenStatus = getTokenStatus(account.token_expires_at);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('account_folders')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setFolders(data || []);
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  };

  const handleFolderChange = async (folderId: string) => {
    try {
      const { error } = await supabase
        .from('threads_accounts')
        .update({ folder_id: folderId === '' ? null : folderId })
        .eq('id', account.id);

      if (error) throw error;

      onAccountUpdate();
    } catch (error: any) {
      console.error('Error updating folder:', error);
      showToast(error.message, 'error');
    }
  };

  const refreshToken = async () => {
    setRefreshingToken(true);
    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-token`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ accountId: account.id }),
        }
      );

      const result = await response.json();

      if (result.success) {
        showToast(`Токен обновлен! Действителен еще ${result.expiresInDays} дней`, 'success');
        logActivity(user.id, 'token_refreshed', { entityType: 'account', accountUsername: account.username });
        onAccountUpdate();
      } else {
        showToast(result.error, 'error');
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setRefreshingToken(false);
    }
  };

  const exchangeLongLivedToken = async () => {
    setRefreshingToken(true);
    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exchange-long-lived-token`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ accountId: account.id }),
        }
      );

      const result = await response.json();

      if (result.success) {
        showToast(`Токен обменян! Действителен ${result.expiresInDays} дней`, 'success');
        logActivity(user.id, 'token_refreshed', { entityType: 'account', accountUsername: account.username });
        onAccountUpdate();
      } else {
        showToast(result.error, 'error');
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setRefreshingToken(false);
    }
  };

  const updateTokenManually = async () => {
    const newToken = prompt('Вставьте новый access token:');
    if (!newToken?.trim()) return;

    setRefreshingToken(true);
    try {
      // Step 1: Save the new token (шифруется на сервере через save-secret)
      try {
        await saveSecret({
          table: 'threads_accounts',
          id: account.id,
          values: { access_token: newToken.trim() },
        });
      } catch (e: any) {
        showToast(e.message, 'error');
        return;
      }

      // Step 2: Automatically exchange for long-lived token
      try {
          const exchHeaders = await getAuthHeaders();
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exchange-long-lived-token`,
            {
              method: 'POST',
              headers: exchHeaders,
              body: JSON.stringify({ accountId: account.id }),
            }
          );

          const result = await response.json();
          if (result.success) {
            showToast(`Токен обменян на long-lived! Действителен ${result.expiresInDays} дней`, 'success');
          } else {
            // Exchange failed — set a temporary expiry so user knows it's not long-lived
            const tempExpiry = new Date();
            tempExpiry.setHours(tempExpiry.getHours() + 1);
            await supabase
              .from('threads_accounts')
              .update({ token_expires_at: tempExpiry.toISOString() })
              .eq('id', account.id);
            showToast(`Токен сохранён, но не удалось обменять на long-lived: ${result.error || 'Неизвестная ошибка'}. Проверьте App Secret.`, 'warning');
          }
        } catch (exchangeError) {
          console.error('Error exchanging token:', exchangeError);
          showToast('Токен сохранён, но ошибка при обмене на long-lived. Попробуйте кнопку "Обменять на long-lived".', 'warning');
        }

      logActivity(user.id, 'token_refreshed', { entityType: 'account', accountUsername: account.username });
      onAccountUpdate();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setRefreshingToken(false);
    }
  };

  const toggleAccountStatus = async () => {
    const { error } = await supabase
      .from('threads_accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id);

    if (!error) {
      onAccountUpdate();
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('threads_accounts')
        .delete()
        .eq('id', account.id);

      if (!error) {
        setShowDeleteConfirm(false);
        showToast('Аккаунт успешно удалён', 'success');
        onAccountDelete();
      } else {
        showToast(error.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка при удалении', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const updateAppCredentials = async () => {
    const newAppId = prompt('Введите Meta App ID:', account.app_id || '');
    if (!newAppId?.trim()) return;

    const newAppSecret = prompt('Введите Meta App Secret:', '');
    if (!newAppSecret?.trim()) return;

    setRefreshingToken(true);
    try {
      // app_secret шифруется на сервере; app_id — несекретное поле (extra).
      let error: { message: string } | null = null;
      try {
        await saveSecret({
          table: 'threads_accounts',
          id: account.id,
          values: { app_secret: newAppSecret.trim() },
          extra: { app_id: newAppId.trim() },
        });
      } catch (e: any) {
        error = { message: e.message };
      }

      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('App credentials обновлены!', 'success');
        onAccountUpdate();
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setRefreshingToken(false);
    }
  };

  const accountsArray = useMemo(() => [account], [account]);

  const mountedTabsRef = useRef(new Set<WorkspaceTab>(['templates']));
  if (!mountedTabsRef.current.has(activeTab)) {
    mountedTabsRef.current.add(activeTab);
  }
  const mountedTabs = mountedTabsRef.current;

  const getStatusBadge = () => {
    if (!account.is_active) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
          <XCircle className="w-3.5 h-3.5" />
          Отключен
        </span>
      );
    }
    if (tokenStatus.status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5" />
          Токен истек
        </span>
      );
    }
    if (tokenStatus.status === 'warning') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
          <Clock className="w-3.5 h-3.5" />
          Токен истекает
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
        <CheckCircle className="w-3.5 h-3.5" />
        Активен
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {(account.is_demo || account.access_token === 'demo') && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-sm text-amber-800 flex items-center gap-2">
          <span className="font-semibold">🧪 Демо-режим.</span>
          Генерация, шаблоны и карусели работают. Публикация в Threads отключена — подключите реальный аккаунт, чтобы публиковать.
        </div>
      )}
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 overflow-hidden">
                {account.profile_picture_url ? (
                  <img src={account.profile_picture_url} alt={account.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-white">
                    {account.username.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-slate-900">@{account.username}</h1>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Shield className="w-4 h-4" />
                    <span>ID: {account.threads_user_id}</span>
                  </div>
                  <div className="w-px h-4 bg-slate-200" />
                  <div className={`flex items-center gap-1.5 ${
                    tokenStatus.status === 'ok' ? 'text-green-600' :
                    tokenStatus.status === 'warning' ? 'text-amber-600' :
                    tokenStatus.status === 'expired' ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    <Clock className="w-4 h-4" />
                    <span>Токен: {tokenStatus.text}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={updateTokenManually}
                disabled={refreshingToken}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition disabled:opacity-50 text-sm"
                title="Обновить токен вручную"
              >
                <Edit3 className="w-4 h-4" />
                <span className="hidden sm:inline">Ввести токен</span>
              </button>
              <button
                onClick={refreshToken}
                disabled={refreshingToken}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition disabled:opacity-50 text-sm font-medium"
                title="Продлить токен"
              >
                <RefreshCw className={`w-4 h-4 ${refreshingToken ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Продлить</span>
              </button>
            </div>
          </div>
        </div>

        <nav className="flex gap-1 px-6 border-t border-slate-100">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition font-medium text-sm ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {mountedTabs.has('templates') && (
          <div className={activeTab === 'templates' ? '' : 'hidden'}>
            <TemplatesPanel selectedAccountId={account.id} />
          </div>
        )}

        {mountedTabs.has('viral') && (
          <div className={activeTab === 'viral' ? '' : 'hidden'}>
            <ViralThreadGenerator user={user} accounts={accountsArray} />
          </div>
        )}

        {mountedTabs.has('carousel') && (
          <div className={activeTab === 'carousel' ? '' : 'hidden'}>
            <CarouselGenerator />
          </div>
        )}

        {mountedTabs.has('autopost') && (
          <div className={activeTab === 'autopost' ? '' : 'hidden'}>
            <AIAutoPosting user={user} accounts={accountsArray} />
          </div>
        )}

        {mountedTabs.has('test') && (
          <div className={activeTab === 'test' ? '' : 'hidden'}>
            <TestThreadPublish account={account} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Настройки аккаунта</h2>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">Статус аккаунта</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Отключенные аккаунты не участвуют в автопостинге
                    </p>
                  </div>
                  <button
                    onClick={toggleAccountStatus}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition font-medium ${
                      account.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {account.is_active ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Активен
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5" />
                        Отключен
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-1">Управление токеном</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Токен используется для публикации в Threads API
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={updateTokenManually}
                    disabled={refreshingToken}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    <Edit3 className="w-4 h-4" />
                    Ввести новый токен
                  </button>
                  <button
                    onClick={exchangeLongLivedToken}
                    disabled={refreshingToken}
                    className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshingToken ? 'animate-spin' : ''}`} />
                    Обменять на long-lived
                  </button>
                  <button
                    onClick={refreshToken}
                    disabled={refreshingToken}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshingToken ? 'animate-spin' : ''}`} />
                    Продлить токен
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-1">Meta App Credentials</h3>
                <p className="text-sm text-slate-500 mb-4">
                  App ID и App Secret необходимы для обмена токенов
                </p>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">App ID</div>
                      <div className="font-mono text-sm text-slate-900">
                        {account.app_id ? account.app_id : <span className="text-red-600">Не указан</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">App Secret</div>
                      <div className="font-mono text-sm text-slate-900">
                        {account.app_secret ? '••••••••••••••••' : <span className="text-red-600">Не указан</span>}
                      </div>
                    </div>
                  </div>
                </div>
                {!account.app_id || !account.app_secret ? (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      Обновите App credentials для работы с long-lived токенами
                    </p>
                  </div>
                ) : null}
                <button
                  onClick={updateAppCredentials}
                  disabled={refreshingToken}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
                >
                  <Edit3 className="w-4 h-4" />
                  Обновить credentials
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-1">Организация аккаунтов</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Группируйте аккаунты по папкам для удобства
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <Folder className="w-4 h-4 inline mr-1" />
                    Папка
                  </label>
                  <select
                    value={account.folder_id || ''}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Без папки</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-2">
                    Используйте папки для группировки аккаунтов по проектам или типам контента
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-red-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-red-600">Удалить аккаунт</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Все шаблоны и расписания будут удалены
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in">
            <div className="p-6">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 text-center mb-2">
                Удалить аккаунт @{account.username}?
              </h3>
              <p className="text-sm text-slate-500 text-center mb-6">
                Все шаблоны, расписания и данные этого аккаунта будут безвозвратно удалены. Это действие нельзя отменить.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Удаление...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Удалить навсегда
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
