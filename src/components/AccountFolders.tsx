import { useState, useEffect } from 'react';
import { Folder, Plus, Edit2, Trash2, X, Check, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface AccountFolder {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface AccountFoldersProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  accountCounts: Record<string, number>;
}

const PRESET_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Cyan', value: '#06b6d4' },
];

export default function AccountFolders({ selectedFolderId, onSelectFolder, accountCounts }: AccountFoldersProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [folders, setFolders] = useState<AccountFolder[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<AccountFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFolders();
  }, [user]);

  const loadFolders = async () => {
    if (!user) return;

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

  const handleCreateFolder = async () => {
    if (!user || !folderName.trim()) return;

    setLoading(true);
    try {
      if (editingFolder) {
        const { error } = await supabase
          .from('account_folders')
          .update({ name: folderName, color: folderColor })
          .eq('id', editingFolder.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('account_folders')
          .insert({
            user_id: user.id,
            name: folderName,
            color: folderColor,
          });

        if (error) throw error;
      }

      setShowCreateModal(false);
      setEditingFolder(null);
      setFolderName('');
      setFolderColor('#3b82f6');
      loadFolders();
    } catch (error: any) {
      console.error('Error saving folder:', error);
      showToast(`Ошибка: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Удалить папку? Аккаунты останутся без папки.')) return;

    try {
      const { error } = await supabase
        .from('account_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;

      if (selectedFolderId === folderId) {
        onSelectFolder(null);
      }

      loadFolders();
    } catch (error: any) {
      console.error('Error deleting folder:', error);
      showToast(`Ошибка: ${error.message}`, 'error');
    }
  };

  const openEditModal = (folder: AccountFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderColor(folder.color);
    setShowCreateModal(true);
  };

  const totalAccounts = accountCounts['all'] || 0;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Папки аккаунтов
        </h3>
        <button
          onClick={() => {
            setEditingFolder(null);
            setFolderName('');
            setFolderColor('#3b82f6');
            setShowCreateModal(true);
          }}
          className="p-1 hover:bg-slate-100 rounded transition"
          title="Создать папку"
        >
          <Plus className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      <div className="space-y-1">
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
            selectedFolderId === null
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span className="flex-1 text-left">Все аккаунты</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            selectedFolderId === null ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {totalAccounts}
          </span>
        </button>

        {folders.map((folder) => {
          const count = accountCounts[folder.id] || 0;
          return (
            <div key={folder.id} className="group relative">
              <button
                onClick={() => onSelectFolder(folder.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                  selectedFolderId === folder.id
                    ? 'font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
                style={{
                  backgroundColor: selectedFolderId === folder.id ? `${folder.color}15` : undefined,
                  color: selectedFolderId === folder.id ? folder.color : undefined,
                }}
              >
                <Folder className="w-4 h-4" style={{ color: folder.color }} />
                <span className="flex-1 text-left truncate">{folder.name}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: selectedFolderId === folder.id ? `${folder.color}20` : '#f1f5f9',
                    color: selectedFolderId === folder.id ? folder.color : '#64748b',
                  }}
                >
                  {count}
                </span>
              </button>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(folder);
                  }}
                  className="p-1 hover:bg-white rounded transition"
                  title="Редактировать"
                >
                  <Edit2 className="w-3 h-3 text-slate-400 hover:text-blue-600" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.id);
                  }}
                  className="p-1 hover:bg-white rounded transition"
                  title="Удалить"
                >
                  <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-600" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingFolder ? 'Редактировать папку' : 'Создать папку'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingFolder(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Название папки
                </label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Например: Личные, Бизнес, Проекты..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Цвет
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setFolderColor(color.value)}
                      className={`w-8 h-8 rounded-lg transition ${
                        folderColor === color.value
                          ? 'ring-2 ring-offset-2 ring-slate-400 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    >
                      {folderColor === color.value && (
                        <Check className="w-4 h-4 text-white mx-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingFolder(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition"
                >
                  Отмена
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!folderName.trim() || loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : editingFolder ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
