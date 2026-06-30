import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase, saveSecret } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface MetaApp {
  id: string;
  name: string;
  app_id: string;
  app_secret: string;
  created_at: string;
}

export function MetaAppsPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [apps, setApps] = useState<MetaApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    app_id: '',
    app_secret: ''
  });

  useEffect(() => {
    loadApps();
  }, [user]);

  const loadApps = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('meta_apps')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApps(data || []);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.app_id.trim() || !formData.app_secret.trim()) {
      showToast('Заполните все поля', 'error');
      return;
    }

    try {
      // app_secret шифруется на сервере (save-secret); напрямую в БД не пишем.
      await saveSecret({
        table: 'meta_apps',
        values: { app_secret: formData.app_secret.trim() },
        extra: { name: formData.name.trim(), app_id: formData.app_id.trim() },
      });

      showToast('Приложение добавлено', 'success');
      setFormData({ name: '', app_id: '', app_secret: '' });
      setShowAddForm(false);
      loadApps();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить это приложение? Все аккаунты, использующие это приложение, останутся без изменений.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('meta_apps')
        .delete()
        .eq('id', id);

      if (error) throw error;

      showToast('Приложение удалено', 'success');
      loadApps();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  if (loading) {
    return <div className="text-gray-400">Загрузка приложений...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-white">Meta Приложения</h3>
          <p className="text-sm text-gray-400 mt-1">
            Сохраните App ID и App Secret один раз, затем выбирайте приложение при добавлении аккаунта
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить приложение
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Название приложения
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Например: Production App"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Meta App ID
            </label>
            <input
              type="text"
              value={formData.app_id}
              onChange={(e) => setFormData({ ...formData, app_id: e.target.value })}
              placeholder="123456789012345"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Meta App Secret
            </label>
            <input
              type="password"
              value={formData.app_secret}
              onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
              placeholder="••••••••••••••••"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setFormData({ name: '', app_id: '', app_secret: '' });
              }}
              className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 hover:bg-gray-600 transition-colors"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {apps.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <p className="text-gray-400">Нет сохранённых приложений</p>
          <p className="text-sm text-gray-500 mt-2">
            Добавьте Meta приложение, чтобы упростить добавление аккаунтов
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-gray-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h4 className="text-white font-medium">{app.name}</h4>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">App ID:</span>
                      <span className="text-gray-300 font-mono">{app.app_id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">App Secret:</span>
                      <span className="text-gray-300 font-mono">
                        {app.app_secret ? '•••••••• (зашифрован)' : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(app.id)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}