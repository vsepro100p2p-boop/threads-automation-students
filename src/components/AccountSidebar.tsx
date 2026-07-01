import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, User, ChevronDown, Check, PanelLeftClose, PanelLeft, Folder as FolderIcon, Settings } from 'lucide-react';
import AccountFolders from './AccountFolders';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';

interface ThreadsAccount {
  id: string;
  threads_user_id: string;
  username: string;
  is_active: boolean;
  token_expires_at: string | null;
  folder_id: string | null;
  profile_picture_url: string | null;
}

interface AccountSidebarProps {
  accounts: ThreadsAccount[];
  allAccounts: ThreadsAccount[];
  selectedAccountId: string | null;
  selectedFolderId: string | null;
  onSelectAccount: (accountId: string) => void;
  onSelectFolder: (folderId: string | null) => void;
  onAddAccount: () => void;
  onAccountsChange: () => void;
  loading: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  showSettings?: boolean;
  onToggleSettings?: (show: boolean) => void;
}

type TokenStatus = 'valid' | 'expiring' | 'expired' | 'unknown';

interface TokenInfo {
  status: TokenStatus;
  text: string;
  shortText: string;
  color: string;
  bgColor: string;
  dotColor: string;
}

function getTokenInfo(expiresAt: string | null, isActive: boolean): TokenInfo {
  if (!isActive) {
    return {
      status: 'unknown',
      text: 'Аккаунт отключен',
      shortText: 'Отключен',
      color: 'text-slate-400',
      bgColor: 'bg-slate-100',
      dotColor: 'bg-slate-400'
    };
  }

  if (!expiresAt) {
    return {
      status: 'unknown',
      text: 'Токен не указан',
      shortText: 'Неизвестно',
      color: 'text-slate-400',
      bgColor: 'bg-slate-100',
      dotColor: 'bg-slate-400'
    };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    const daysAgo = Math.abs(daysLeft);
    return {
      status: 'expired',
      text: `Истек ${daysAgo} дн. назад`,
      shortText: 'Истек',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      dotColor: 'bg-red-500'
    };
  } else if (daysLeft < 7) {
    return {
      status: 'expiring',
      text: `Истекает через ${daysLeft} дн.`,
      shortText: 'Скоро истечет',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      dotColor: 'bg-amber-500'
    };
  } else {
    return {
      status: 'valid',
      text: `Действует ${daysLeft} дн.`,
      shortText: 'Активен',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      dotColor: 'bg-emerald-500'
    };
  }
}

export default function AccountSidebar({
  accounts,
  allAccounts,
  selectedAccountId,
  selectedFolderId,
  onSelectAccount,
  onSelectFolder,
  onAddAccount,
  onAccountsChange,
  loading,
  collapsed,
  onToggleCollapse,
  showSettings,
  onToggleSettings,
}: AccountSidebarProps) {
  const { showToast } = useToast();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const selectedTokenInfo = useMemo(
    () => selectedAccount ? getTokenInfo(selectedAccount.token_expires_at, selectedAccount.is_active) : null,
    [selectedAccount?.token_expires_at, selectedAccount?.is_active]
  );

  const accountCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allAccounts.length,
    };
    allAccounts.forEach(account => {
      if (account.folder_id) {
        counts[account.folder_id] = (counts[account.folder_id] || 0) + 1;
      }
    });
    return counts;
  }, [allAccounts]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAccount = (accountId: string) => {
    onSelectAccount(accountId);
    setIsDropdownOpen(false);
  };

  const handleAssignFolder = async (accountId: string, folderId: string | null) => {
    try {
      const { error } = await supabase
        .from('threads_accounts')
        .update({ folder_id: folderId })
        .eq('id', accountId);

      if (error) throw error;

      setShowFolderMenu(null);
      onAccountsChange();
    } catch (error) {
      console.error('Error assigning folder:', error);
      showToast('Ошибка при назначении папки', 'error');
    }
  };

  if (loading) {
    return (
      <div className={`${collapsed ? 'w-16' : 'w-72'} bg-white border-r border-slate-200 flex flex-col transition-all duration-200`}>
        <div className="p-4">
          <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600"></div>
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 transition-all duration-200">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-100 rounded-lg transition mb-4"
          title="Развернуть панель"
        >
          <PanelLeft className="w-5 h-5 text-slate-500" />
        </button>

        {accounts.map((account) => {
          const tokenInfo = getTokenInfo(account.token_expires_at, account.is_active);
          const isSelected = account.id === selectedAccountId;

          return (
            <button
              key={account.id}
              onClick={() => onSelectAccount(account.id)}
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm mb-2 transition overflow-hidden ${
                isSelected
                  ? 'ring-2 ring-blue-500 ring-offset-2'
                  : 'hover:ring-2 hover:ring-slate-300 hover:ring-offset-1'
              } ${
                !account.profile_picture_url && (account.is_active
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600'
                  : 'bg-slate-400')
              }`}
              title={`@${account.username} - ${tokenInfo.shortText}`}
            >
              {account.profile_picture_url ? (
                <img src={account.profile_picture_url} alt={account.username} className="w-full h-full object-cover" />
              ) : (
                account.username.charAt(0).toUpperCase()
              )}
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${tokenInfo.dotColor}`} />
            </button>
          );
        })}

        <button
          onClick={onAddAccount}
          className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition mt-2"
          title="Добавить аккаунт"
        >
          <Plus className="w-5 h-5 text-slate-500" />
        </button>

        <div className="flex-1" />

        {onToggleSettings && (
          <button
            type="button"
            onClick={() => onToggleSettings(!showSettings)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
              showSettings
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
            title="Настройки"
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 bg-white border-r border-slate-200 flex flex-col transition-all duration-200">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider px-1">
            Текущий профиль
          </p>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition"
            title="Свернуть панель"
          >
            <PanelLeftClose className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="relative" ref={dropdownRef}>
          {selectedAccount ? (
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isDropdownOpen
                  ? 'border-blue-300 bg-blue-50/50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm overflow-hidden">
                {selectedAccount.profile_picture_url ? (
                  <img src={selectedAccount.profile_picture_url} alt={selectedAccount.username} className="w-full h-full object-cover" />
                ) : (
                  selectedAccount.username.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-slate-900 truncate text-sm">
                  @{selectedAccount.username}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedTokenInfo!.dotColor}`} />
                  <span className={`text-xs font-medium ${selectedTokenInfo!.color}`}>
                    {selectedTokenInfo!.shortText}
                  </span>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <button
              onClick={onAddAccount}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition">
                <Plus className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-slate-600 group-hover:text-blue-600 text-sm">Добавить аккаунт</p>
                <p className="text-xs text-slate-400">Подключить Threads</p>
              </div>
            </button>
          )}

          {isDropdownOpen && accounts.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 z-50 overflow-hidden">
              <div className="p-2 max-h-64 overflow-y-auto">
                {accounts.map((account) => {
                  const tokenInfo = getTokenInfo(account.token_expires_at, account.is_active);
                  const isSelected = account.id === selectedAccountId;

                  return (
                    <button
                      key={account.id}
                      onClick={() => handleSelectAccount(account.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition ${
                        isSelected
                          ? 'bg-blue-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm overflow-hidden ${
                        isSelected
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600'
                          : 'bg-slate-400'
                      }`}>
                        {account.profile_picture_url ? (
                          <img src={account.profile_picture_url} alt={account.username} className="w-full h-full object-cover" />
                        ) : (
                          account.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className={`font-medium truncate text-sm ${isSelected ? 'text-blue-600' : 'text-slate-700'}`}>
                          @{account.username}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${tokenInfo.dotColor}`} />
                          <span className={`text-xs ${tokenInfo.color}`}>
                            {tokenInfo.shortText}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 p-2">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onAddAccount();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition text-slate-600 hover:text-blue-600"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-sm">Добавить профиль</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-2 border-b border-slate-100">
        <AccountFolders
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          accountCounts={accountCounts}
        />
      </div>

      {accounts.length > 1 && (
        <div className="px-4 pb-4 pt-2">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2 px-1">
            Быстрое переключение
          </p>
          <div className="space-y-1">
            {accounts.map((account) => {
              const tokenInfo = getTokenInfo(account.token_expires_at, account.is_active);
              const isSelected = account.id === selectedAccountId;

              return (
                <button
                  key={account.id}
                  onClick={() => onSelectAccount(account.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                    isSelected
                      ? 'bg-slate-100'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-xs overflow-hidden ${
                    tokenInfo.status === 'expired'
                      ? 'bg-slate-400'
                      : 'bg-gradient-to-br from-slate-600 to-slate-700'
                  }`}>
                    {account.profile_picture_url ? (
                      <img src={account.profile_picture_url} alt={account.username} className="w-full h-full object-cover" />
                    ) : (
                      account.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className={`font-medium truncate text-sm ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                      @{account.username}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${tokenInfo.dotColor}`} />
                      <span className={`text-xs ${tokenInfo.color}`}>
                        {tokenInfo.shortText}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {accounts.length === 0 && (
        <div className="p-4">
          <div className="bg-slate-50 rounded-xl p-6 text-center">
            <div className="w-14 h-14 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium mb-1">Нет аккаунтов</p>
            <p className="text-slate-400 text-sm mb-4">Подключите Threads аккаунт</p>
            <button
              onClick={onAddAccount}
              className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Добавить аккаунт
            </button>
          </div>
        </div>
      )}

      {onToggleSettings && (
        <div className="p-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onToggleSettings(!showSettings)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm font-medium ${
              showSettings
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span>Настройки</span>
          </button>
        </div>
      )}
    </div>
  );
}
