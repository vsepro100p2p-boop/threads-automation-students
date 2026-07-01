import { useState, useEffect } from 'react';
import { Folder, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface TemplateFolder {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface TemplateFoldersProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
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

export default function TemplateFolders({ selectedFolderId, onSelectFolder }: TemplateFoldersProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [folders, setFolders] = useState<TemplateFolder[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<TemplateFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
    isDanger?: boolean;
  } | null>(null);

  useEffect(() => {
    loadFolders();
  }, [user]);

  const loadFolders = async () => {
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
  };

  const handleCreateFolder = async () => {
    if (!user || !folderName.trim()) return;

    setLoading(true);
    try {
      if (editingFolder) {
        const { error } = await supabase
          .from('template_folders')
          .update({ name: folderName, color: folderColor })
          .eq('id', editingFolder.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('template_folders')
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

  const handleDeleteFolder = (folderId: string) => {
    setConfirmConfig({
      title: 'Удалить эту папку?',
      message: 'Папка будет удалена. Все шаблоны, находившиеся в ней, перейдут в общую категорию «Все шаблоны» (не будут удалены).',
      confirmText: 'Удалить',
      isDanger: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('template_folders')
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
      }
    });
  };

  const openEditModal = (folder: TemplateFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderColor(folder.color);
    setShowCreateModal(true);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Folder className="w-4 h-4" />
          Папки шаблонов
        </h3>
        <button
          onClick={() => {
            setEditingFolder(null);
            setFolderName('');
            setFolderColor('#3b82f6');
            setShowCreateModal(true);
          }}
          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Создать
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={() => onSelectFolder(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            selectedFolderId === null
              ? 'bg-slate-700 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Все шаблоны
        </button>

        {folders.map((folder) => (
          <div key={folder.id} className="flex items-center gap-1">
            <button
              onClick={() => onSelectFolder(folder.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                selectedFolderId === folder.id
                  ? 'text-white'
                  : 'bg-slate-100 hover:bg-slate-200'
              }`}
              style={{
                backgroundColor: selectedFolderId === folder.id ? folder.color : undefined,
                color: selectedFolderId === folder.id ? 'white' : '#475569',
              }}
            >
              <Folder className="w-3 h-3" />
              {folder.name}
            </button>
            <button
              onClick={() => openEditModal(folder)}
              className="p-1 hover:bg-slate-100 rounded transition"
            >
              <Edit2 className="w-3 h-3 text-slate-400" />
            </button>
            <button
              onClick={() => handleDeleteFolder(folder.id)}
              className="p-1 hover:bg-red-100 rounded transition"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          </div>
        ))}
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
                  placeholder="Например: Мотивация, Факты, Юмор..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

      {confirmConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
              confirmConfig.isDanger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {confirmConfig.isDanger ? (
                <Trash2 className="w-6 h-6" />
              ) : (
                <Folder className="w-6 h-6" /> // wait! Folder is not imported as Folder on line 2, wait! It is imported as `Folder as FolderIcon`! So let's use Trash2 or FolderIcon!
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
    </div>
  );
}
