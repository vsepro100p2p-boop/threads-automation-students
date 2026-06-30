import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Upload, Trash2, FolderPlus, Check, Image, Loader2, Search, Grid, List, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface MediaItem {
  id: string;
  name: string;
  file_path: string;
  public_url: string;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  folder: string;
  created_at: string;
}

interface MediaLibraryProps {
  onClose: () => void;
  onSelect?: (urls: string[]) => void;
  selectionMode?: boolean;
  maxSelection?: number;
  initialSelected?: string[];
}

const FOLDERS = [
  { id: 'general', name: 'Общее', color: 'bg-slate-500' },
  { id: 'templates', name: 'Для шаблонов', color: 'bg-blue-500' },
  { id: 'carousel', name: 'Карусели', color: 'bg-teal-500' },
  { id: 'archive', name: 'Архив', color: 'bg-amber-500' },
];

export default function MediaLibrary({
  onClose,
  onSelect,
  selectionMode = false,
  maxSelection = 20,
  initialSelected = [],
}: MediaLibraryProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set(initialSelected));
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isDragging, setIsDragging] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      let query = supabase
        .from('media_library')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (selectedFolder) {
        query = query.eq('folder', selectedFolder);
      }

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setMedia(data || []);
    } catch (error) {
      console.error('Error loading media:', error);
      showToast('Ошибка загрузки медиа', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, selectedFolder, searchQuery, showToast]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const uploadFiles = async (files: FileList | File[]) => {
    if (!user) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        showToast(`${file.name}: неподдерживаемый формат`, 'warning');
        return false;
      }
      if (file.size > 8 * 1024 * 1024) {
        showToast(`${file.name}: файл слишком большой (макс. 8MB)`, 'warning');
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setUploading(true);
    let uploadedCount = 0;

    try {
      for (const file of validFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('template-images')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('template-images')
          .getPublicUrl(fileName);

        const { error: dbError } = await supabase
          .from('media_library')
          .insert({
            user_id: user.id,
            name: file.name,
            file_path: fileName,
            public_url: publicUrl,
            file_size: file.size,
            mime_type: file.type,
            folder: selectedFolder || 'general',
          });

        if (dbError) {
          console.error('DB error:', dbError);
          continue;
        }

        uploadedCount++;
      }

      if (uploadedCount > 0) {
        showToast(`Загружено ${uploadedCount} файлов`, 'success');
        loadMedia();
      }
    } catch (error: any) {
      console.error('Error uploading files:', error);
      showToast('Ошибка загрузки файлов', 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteMedia = async (items: string[]) => {
    if (!user || items.length === 0) return;

    if (!confirm(`Удалить ${items.length} файлов?`)) return;

    try {
      const itemsToDelete = media.filter(m => items.includes(m.id));

      for (const item of itemsToDelete) {
        await supabase.storage
          .from('template-images')
          .remove([item.file_path]);
      }

      const { error } = await supabase
        .from('media_library')
        .delete()
        .in('id', items);

      if (error) throw error;

      setSelectedItems(new Set());
      setBulkMode(false);
      showToast(`Удалено ${items.length} файлов`, 'success');
      loadMedia();
    } catch (error) {
      console.error('Error deleting media:', error);
      showToast('Ошибка удаления', 'error');
    }
  };

  const moveToFolder = async (items: string[], folder: string) => {
    if (!user || items.length === 0) return;

    try {
      const { error } = await supabase
        .from('media_library')
        .update({ folder, updated_at: new Date().toISOString() })
        .in('id', items);

      if (error) throw error;

      setSelectedItems(new Set());
      setBulkMode(false);
      setShowFolderMenu(null);
      showToast(`Перемещено ${items.length} файлов`, 'success');
      loadMedia();
    } catch (error) {
      console.error('Error moving media:', error);
      showToast('Ошибка перемещения', 'error');
    }
  };

  const toggleItemSelection = (id: string, url: string) => {
    if (selectionMode) {
      const newSelected = new Set(selectedItems);
      if (newSelected.has(url)) {
        newSelected.delete(url);
      } else if (newSelected.size < maxSelection) {
        newSelected.add(url);
      } else {
        showToast(`Максимум ${maxSelection} изображений`, 'warning');
        return;
      }
      setSelectedItems(newSelected);
    } else if (bulkMode) {
      const newSelected = new Set(selectedItems);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      setSelectedItems(newSelected);
    }
  };

  const handleConfirmSelection = () => {
    if (onSelect && selectedItems.size > 0) {
      onSelect(Array.from(selectedItems));
    }
    onClose();
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
      uploadFiles(e.dataTransfer.files);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectAllInView = () => {
    if (selectionMode) {
      const urls = media.slice(0, maxSelection).map(m => m.public_url);
      setSelectedItems(new Set(urls));
    } else {
      const ids = media.map(m => m.id);
      setSelectedItems(new Set(ids));
    }
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <Image className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Медиа-библиотека</h3>
              <p className="text-xs text-slate-500">
                {media.length} файлов {selectedItems.size > 0 && `| Выбрано: ${selectedItems.size}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent w-48"
              />
            </div>
            <select
              value={selectedFolder || ''}
              onChange={(e) => setSelectedFolder(e.target.value || null)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="">Все папки</option>
              {FOLDERS.map(folder => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition ${viewMode === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!selectionMode && (
              <button
                onClick={() => {
                  setBulkMode(!bulkMode);
                  setSelectedItems(new Set());
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  bulkMode
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {bulkMode ? 'Отменить' : 'Выбрать'}
              </button>
            )}
            {(bulkMode || selectionMode) && selectedItems.size > 0 && (
              <>
                <button
                  onClick={selectAllInView}
                  className="px-3 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition"
                >
                  Выбрать все
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition"
                >
                  Снять все
                </button>
              </>
            )}
            {bulkMode && selectedItems.size > 0 && (
              <>
                <div className="relative">
                  <button
                    onClick={() => setShowFolderMenu(showFolderMenu ? null : 'bulk')}
                    className="px-3 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-sm font-medium transition flex items-center gap-1"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Переместить
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showFolderMenu === 'bulk' && (
                    <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10 min-w-[160px]">
                      {FOLDERS.map(folder => (
                        <button
                          key={folder.id}
                          onClick={() => moveToFolder(Array.from(selectedItems), folder.id)}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <div className={`w-3 h-3 rounded-full ${folder.color}`} />
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteMedia(Array.from(selectedItems))}
                  className="px-3 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-medium transition flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить ({selectedItems.size})
                </button>
              </>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Загрузить
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              className="hidden"
            />
          </div>
        </div>

        <div
          className={`flex-1 overflow-y-auto p-4 ${isDragging ? 'bg-teal-50' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
          ) : media.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Image className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-900 font-semibold mb-1">Нет изображений</p>
              <p className="text-slate-500 text-sm mb-4">
                Загрузите изображения для использования в шаблонах
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition"
              >
                Загрузить первое изображение
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {media.map((item) => {
                const isSelected = selectionMode
                  ? selectedItems.has(item.public_url)
                  : selectedItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItemSelection(item.id, item.public_url)}
                    className={`relative group aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition ${
                      isSelected
                        ? 'border-teal-500 ring-2 ring-teal-200'
                        : 'border-transparent hover:border-slate-200'
                    }`}
                  >
                    <img
                      src={item.public_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="%23f1f5f9" width="100" height="100"/><text fill="%2394a3b8" font-size="12" x="50" y="50" text-anchor="middle" dy=".3em">Error</text></svg>';
                      }}
                    />
                    {(selectionMode || bulkMode) && (
                      <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                        isSelected
                          ? 'bg-teal-500 border-teal-500'
                          : 'bg-white/80 border-slate-300'
                      }`}>
                        {isSelected && <Check className="w-4 h-4 text-white" />}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
                      <p className="text-white text-xs truncate">{item.name}</p>
                      <p className="text-white/70 text-[10px]">{formatFileSize(item.file_size)}</p>
                    </div>
                    {!selectionMode && !bulkMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMedia([item.id]);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {media.map((item) => {
                const isSelected = selectionMode
                  ? selectedItems.has(item.public_url)
                  : selectedItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItemSelection(item.id, item.public_url)}
                    className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer border-2 transition ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    {(selectionMode || bulkMode) && (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'bg-teal-500 border-teal-500'
                          : 'border-slate-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    )}
                    <img
                      src={item.public_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-medium truncate">{item.name}</p>
                      <p className="text-slate-500 text-xs">
                        {formatFileSize(item.file_size)} | {item.mime_type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        FOLDERS.find(f => f.id === item.folder)?.color || 'bg-slate-500'
                      } text-white`}>
                        {FOLDERS.find(f => f.id === item.folder)?.name || item.folder}
                      </span>
                      {!selectionMode && !bulkMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMedia([item.id]);
                          }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isDragging && (
            <div className="absolute inset-4 border-2 border-dashed border-teal-500 bg-teal-50/80 rounded-xl flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <Upload className="w-12 h-12 text-teal-600 mx-auto mb-2" />
                <p className="text-teal-700 font-medium">Отпустите для загрузки</p>
              </div>
            </div>
          )}
        </div>

        {selectionMode && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <p className="text-sm text-slate-600">
              Выбрано: <span className="font-semibold text-slate-900">{selectedItems.size}</span> / {maxSelection}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmSelection}
                disabled={selectedItems.size === 0}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition"
              >
                Выбрать ({selectedItems.size})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
