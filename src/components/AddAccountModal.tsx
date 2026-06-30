import { useState, useEffect } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { supabase, getAuthHeaders, saveSecret } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { logActivity } from '../lib/activityLogger';

interface AddAccountModalProps {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface MetaApp {
  id: string;
  name: string;
  app_id: string;
  app_secret: string;
}

export default function AddAccountModal({ userId, onClose, onSuccess }: AddAccountModalProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    username: '',
    threadsUserId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [metaApps, setMetaApps] = useState<MetaApp[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [useManualEntry, setUseManualEntry] = useState(false);

  useEffect(() => {
    loadMetaApps();
  }, []);

  const loadMetaApps = async () => {
    try {
      const { data, error } = await supabase
        .from('meta_apps')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMetaApps(data || []);

      if (!data || data.length === 0) {
        setUseManualEntry(true);
      } else {
        setUseManualEntry(false);
      }
    } catch (error) {
      console.error('Error loading meta apps:', error);
      setUseManualEntry(true);
    }
  };

  const handleAppSelect = (appId: string) => {
    setSelectedAppId(appId);
    const app = metaApps.find(a => a.id === appId);
    if (app) {
      setFormData({
        ...formData,
        appId: app.app_id,
        appSecret: app.app_secret
      });
    } else {
      setFormData({
        ...formData,
        appId: '',
        appSecret: ''
      });
    }
  };

  const validate = (): string | null => {
    if (!/^\d+$/.test(formData.threadsUserId.trim())) {
      return 'Threads User ID должен содержать только цифры';
    }
    if (!/^\d+$/.test(formData.appId.trim())) {
      return 'Meta App ID должен содержать только цифры';
    }
    if (formData.accessToken.trim().length < 20) {
      return 'Access Token слишком короткий. Проверьте правильность токена.';
    }
    if (formData.appSecret.trim().length < 10) {
      return 'App Secret слишком короткий. Проверьте правильность.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      // access_token и app_secret шифруются на сервере (save-secret); напрямую
      // в БД их не пишем.
      const saved = await saveSecret({
        table: 'threads_accounts',
        values: {
          access_token: formData.accessToken,
          app_secret: formData.appSecret,
        },
        extra: {
          threads_user_id: formData.threadsUserId,
          username: formData.username,
          app_id: formData.appId,
          is_active: true,
        },
      });
      const newAccount = saved.row;

      // Fetch profile picture using the provided access token
      if (newAccount) {
        try {
          const profileResponse = await fetch(
            `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${formData.accessToken}`
          );
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (profileData.threads_profile_picture_url) {
              await supabase
                .from('threads_accounts')
                .update({ profile_picture_url: profileData.threads_profile_picture_url })
                .eq('id', newAccount.id);
            }
          }
        } catch (pfpError) {
          console.warn('Could not fetch profile picture:', pfpError);
        }
      }

      const exchHeaders = await getAuthHeaders();
      if (newAccount) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exchange-long-lived-token`,
            {
              method: 'POST',
              headers: exchHeaders,
              body: JSON.stringify({ accountId: newAccount.id }),
            }
          );

          const result = await response.json();
          if (result.success) {
            showToast(`Аккаунт добавлен! Токен действителен ${result.expiresInDays} дней`, 'success');
          } else {
            showToast('Аккаунт добавлен, но не удалось обменять токен. Обновите токен в настройках.', 'warning');
          }
        } catch (error) {
          console.error('Error exchanging token:', error);
          showToast('Аккаунт добавлен, но произошла ошибка при проверке токена.', 'warning');
        }
      }

      logActivity(userId, 'account_added', {
        entityType: 'account',
        accountUsername: formData.username,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col my-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <h3 className="text-xl font-semibold text-slate-900">Добавить Threads аккаунт</h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-2">Как получить Threads API credentials:</p>
                <ol className="list-decimal ml-4 space-y-1 text-blue-700">
                  <li>Зайдите в <a href="https://developers.facebook.com/" target="_blank" rel="noopener" className="underline">Meta for Developers</a> и создайте приложение</li>
                  <li>Скопируйте App ID и App Secret из настроек приложения</li>
                  <li>Добавьте Threads API разрешения (threads_basic, threads_content_publish)</li>
                  <li>Сгенерируйте User Access Token через Graph API Explorer</li>
                  <li>Получите ваш Threads User ID: https://graph.threads.net/v1.0/me?fields=id&access_token=YOUR_TOKEN</li>
                </ol>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="@yourthreadsusername"
                required
              />
            </div>

            {metaApps.length > 0 && !useManualEntry ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Выберите Meta приложение
                </label>
                <select
                  value={selectedAppId}
                  onChange={(e) => handleAppSelect(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                >
                  <option value="">Выберите приложение...</option>
                  {metaApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} (App ID: {app.app_id})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setUseManualEntry(true);
                    setSelectedAppId('');
                    setFormData({ ...formData, appId: '', appSecret: '' });
                  }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Или ввести App ID и Secret вручную
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Meta App ID
                    </label>
                    <input
                      type="text"
                      value={formData.appId}
                      onChange={(e) => setFormData({ ...formData, appId: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      placeholder="1234567890123456"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Meta App Secret
                    </label>
                    <input
                      type="password"
                      value={formData.appSecret}
                      onChange={(e) => setFormData({ ...formData, appSecret: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      placeholder="Ваш app secret"
                      required
                    />
                  </div>
                </div>
                {metaApps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseManualEntry(false);
                      setSelectedAppId('');
                      setFormData({ ...formData, appId: '', appSecret: '' });
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Или выбрать из сохранённых приложений
                  </button>
                )}
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Threads User ID
              </label>
              <input
                type="text"
                value={formData.threadsUserId}
                onChange={(e) => setFormData({ ...formData, threadsUserId: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="1234567890"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Access Token
              </label>
              <input
                type="password"
                value={formData.accessToken}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Ваш Meta API access token"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 font-medium"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Добавление...
                  </>
                ) : (
                  'Добавить аккаунт'
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition font-medium"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
