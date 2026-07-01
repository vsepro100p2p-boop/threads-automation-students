import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { LogOut, Activity, TrendingUp, Calendar, Users, Settings, Image } from 'lucide-react';
import AccountSidebar from './AccountSidebar';
import AccountWorkspace from './AccountWorkspace';
import AddAccountModal from './AddAccountModal';
import { SettingsPanel } from './SettingsPanel';
import MediaLibrary from './MediaLibrary';

interface ThreadsAccount {
  id: string;
  threads_user_id: string;
  username: string;
  is_active: boolean;
  token_expires_at: string | null;
  access_token: string;
  folder_id: string | null;
  profile_picture_url: string | null;
  is_demo?: boolean;
}

export function Dashboard() {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<ThreadsAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [stats, setStats] = useState({
    totalPosts: 0,
    publishedToday: 0,
    scheduledPosts: 0,
    activeAccounts: 0,
  });

  const selectedAccountIdRef = useRef(selectedAccountId);
  selectedAccountIdRef.current = selectedAccountId;
  const initialLoadDone = useRef(false);

  const loadAccounts = useCallback(async () => {
    if (!user) return;
    // Only show full loading spinner on initial load
    if (!initialLoadDone.current) {
      setLoading(true);
    }

    const { data } = await supabase
      .from('threads_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const accountsList = data || [];
    setAccounts(accountsList);

    const currentSelected = selectedAccountIdRef.current;
    if (!currentSelected && accountsList.length > 0) {
      setSelectedAccountId(accountsList[0].id);
    } else if (currentSelected && !accountsList.find(a => a.id === currentSelected)) {
      setSelectedAccountId(accountsList.length > 0 ? accountsList[0].id : null);
    }

    setLoading(false);
    initialLoadDone.current = true;
  }, [user]);

  const loadProfile = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    setProfile(data);
  }, [user]);

  const loadStats = useCallback(async () => {
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [postsData, todayData, scheduledData, accountsData] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'published')
        .gte('published_at', today.toISOString()),
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'scheduled'),
      supabase
        .from('threads_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true),
    ]);

    setStats({
      totalPosts: postsData.count || 0,
      publishedToday: todayData.count || 0,
      scheduledPosts: scheduledData.count || 0,
      activeAccounts: accountsData.count || 0,
    });
  }, [user]);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadStats();
      loadAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSelectAccount = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
  }, []);

  const handleAddAccount = useCallback(() => {
    setShowAddModal(true);
  }, []);

  const [creatingDemo, setCreatingDemo] = useState(false);
  const handleCreateDemo = useCallback(async () => {
    if (!user) return;
    setCreatingDemo(true);
    try {
      // Демо-аккаунт помечаем по access_token='demo' (не требует новой колонки в БД).
      const existingDemo = accounts.find(a => a.access_token === 'demo' || a.is_demo);
      if (existingDemo) {
        setSelectedAccountId(existingDemo.id);
        return;
      }
      const { data, error } = await supabase
        .from('threads_accounts')
        .insert({
          user_id: user.id,
          threads_user_id: `demo-${user.id.slice(0, 8)}`,
          username: 'Демо-аккаунт',
          access_token: 'demo',
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      await loadAccounts();
      if (data) setSelectedAccountId(data.id);
    } catch (e: any) {
      console.error('Error creating demo account:', e);
      showToast(`Не удалось создать демо-аккаунт: ${e.message || e}`, 'error');
    } finally {
      setCreatingDemo(false);
    }
  }, [user, accounts, loadAccounts]);

  const handleAccountAdded = useCallback(() => {
    loadAccounts();
    loadStats();
  }, [loadAccounts, loadStats]);

  const handleAccountDeleted = useCallback(() => {
    setSelectedAccountId(null);
    loadAccounts();
    loadStats();
  }, [loadAccounts, loadStats]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const filteredAccounts = useMemo(() => {
    if (selectedFolderId === null) {
      return accounts;
    }
    return accounts.filter(a => a.folder_id === selectedFolderId);
  }, [accounts, selectedFolderId]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <nav className="bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="px-4 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <button
              onClick={() => setShowGlobalSettings(false)}
              className="flex items-center gap-3 hover:opacity-80 transition"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-base font-semibold text-white">Threads Manager</h1>
              </div>
            </button>

            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span>{stats.totalPosts} постов</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span>{stats.publishedToday} сегодня</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>{stats.scheduledPosts} запланировано</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>{stats.activeAccounts} аккаунтов</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400 hidden sm:block">
                  {profile?.full_name || profile?.email}
                </span>
                <button
                  onClick={() => setShowMediaLibrary(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition text-sm"
                >
                  <Image className="w-4 h-4" />
                  <span className="hidden sm:inline">Медиа</span>
                </button>
                <button
                  onClick={() => setShowGlobalSettings(!showGlobalSettings)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-sm ${
                    showGlobalSettings
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Настройки</span>
                </button>
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Выйти</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        <AccountSidebar
          accounts={filteredAccounts}
          allAccounts={accounts}
          selectedAccountId={showGlobalSettings ? null : selectedAccountId}
          selectedFolderId={selectedFolderId}
          onSelectAccount={(id) => {
            setShowGlobalSettings(false);
            handleSelectAccount(id);
          }}
          onSelectFolder={setSelectedFolderId}
          onAddAccount={handleAddAccount}
          onAccountsChange={loadAccounts}
          loading={loading}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          showSettings={showGlobalSettings}
          onToggleSettings={setShowGlobalSettings}
        />

        {showGlobalSettings ? (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Настройки</h2>
                <button
                  type="button"
                  onClick={() => setShowGlobalSettings(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition shadow-sm"
                >
                  Вернуться на панель
                </button>
              </div>
              <SettingsPanel />
            </div>
          </div>
        ) : selectedAccount && user ? (
          <AccountWorkspace
            account={selectedAccount}
            user={user}
            onAccountUpdate={handleAccountAdded}
            onAccountDelete={handleAccountDeleted}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center max-w-md px-4">
              <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-10 h-10 text-slate-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">
                {accounts.length === 0 ? 'Добавьте первый аккаунт' : 'Выберите аккаунт'}
              </h2>
              <p className="text-slate-600 mb-6">
                {accounts.length === 0
                  ? 'Подключите Threads аккаунт чтобы начать автоматизацию публикаций'
                  : 'Выберите аккаунт в боковой панели для работы с шаблонами и настройками'}
              </p>
              {accounts.length === 0 && (
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={handleAddAccount}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium"
                  >
                    Добавить аккаунт
                  </button>
                  <button
                    onClick={handleCreateDemo}
                    disabled={creatingDemo}
                    className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl hover:border-slate-400 transition font-medium disabled:opacity-50"
                  >
                    {creatingDemo ? 'Создаём…' : 'Попробовать без подключения'}
                  </button>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Демо-режим: генерация, шаблоны и карусели работают. Публикация в Threads отключена.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAddModal && user && (
        <AddAccountModal
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAccountAdded}
        />
      )}

      {showMediaLibrary && (
        <MediaLibrary
          onClose={() => setShowMediaLibrary(false)}
        />
      )}
    </div>
  );
}
