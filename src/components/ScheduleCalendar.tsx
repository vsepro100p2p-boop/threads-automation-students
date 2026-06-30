import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface Schedule {
  id: string;
  template_id: string;
  scheduled_for: string;
  status: string;
  template_name?: string;
  template_content?: string[];
}

interface ScheduleCalendarProps {
  onClose: () => void;
  templates: Array<{
    id: string;
    name: string;
    threads_account_id: string;
  }>;
}

export default function ScheduleCalendar({ onClose, templates }: ScheduleCalendarProps) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedTime, setSelectedTime] = useState('12:00');
  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);
  const [showDayView, setShowDayView] = useState(false);
  const [dayViewDate, setDayViewDate] = useState<Date | null>(null);
  const [userTimezone, setUserTimezone] = useState('UTC');

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.timezone) setUserTimezone(data.timezone);
        });
    }
  }, [user]);

  useEffect(() => {
    loadSchedules();
  }, [currentDate]);

  const loadSchedules = async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('template_schedules')
        .select(`
          id,
          template_id,
          scheduled_for,
          status,
          thread_templates!inner(name, content)
        `)
        .gte('scheduled_for', startOfMonth.toISOString())
        .lte('scheduled_for', endOfMonth.toISOString())
        .order('scheduled_for', { ascending: true });

      if (error) throw error;

      const mappedSchedules = data?.map((s: any) => ({
        ...s,
        template_name: s.thread_templates?.name || 'Unknown',
        template_content: s.thread_templates?.content || [],
      })) || [];

      setSchedules(mappedSchedules);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const daysInMonth = lastDay.getUTCDate();
    const startingDayOfWeek = firstDay.getUTCDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < (startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1); i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(Date.UTC(year, month, day, 12, 0, 0)));
    }

    return days;
  };

  const getDateInTimezone = useCallback((date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }, [userTimezone]);

  const getHourMinuteInTimezone = useCallback((date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(date);
  }, [userTimezone]);

  const getSchedulesForDate = (date: Date) => {
    const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return schedules.filter(s => {
      const scheduleDate = new Date(s.scheduled_for);
      return getDateInTimezone(scheduleDate) === dateStr;
    });
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleDateClick = (date: Date) => {
    setDayViewDate(date);
    setShowDayView(true);
  };

  const handleAddSchedule = async () => {
    if (!selectedDate || !selectedTemplate || !selectedTime) {
      showToast('Выберите шаблон и время', 'warning');
      return;
    }

    try {
      const year = selectedDate.getUTCFullYear();
      const month = String(selectedDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getUTCDate()).padStart(2, '0');
      const [hours, minutes] = selectedTime.split(':');

      const tempDate = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00Z`);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        timeZoneName: 'longOffset',
      });
      const parts = formatter.formatToParts(tempDate);
      const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
      const offset = offsetPart.replace('GMT', '') || '+00:00';
      const dateTimeStr = `${year}-${month}-${day}T${hours}:${minutes}:00${offset}`;
      const utcDateTime = new Date(dateTimeStr);

      const { error } = await supabase
        .from('template_schedules')
        .insert({
          template_id: selectedTemplate,
          scheduled_for: utcDateTime.toISOString(),
          status: 'pending',
        });

      if (error) throw error;

      setShowAddModal(false);
      const addedDate = selectedDate;
      setSelectedTemplate('');
      setSelectedTime('12:00');
      loadSchedules();

      if (addedDate) {
        setDayViewDate(addedDate);
        setShowDayView(true);
      }
      setSelectedDate(null);
    } catch (error) {
      console.error('Error adding schedule:', error);
      showToast('Ошибка при добавлении расписания', 'error');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Удалить это расписание?')) return;

    try {
      const { error } = await supabase
        .from('template_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      loadSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  const days = getDaysInMonth();
  const nowDateStr = getDateInTimezone(new Date());
  const nowParts = nowDateStr.split('-');
  const today = new Date(Date.UTC(Number(nowParts[0]), Number(nowParts[1]) - 1, Number(nowParts[2]), 12, 0, 0));
  const monthName = currentDate.toLocaleDateString('ru', { month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-700">
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">📅 Календарь публикаций</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={handlePrevMonth}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-semibold text-white capitalize">{monthName}</h3>
            <button
              onClick={handleNextMonth}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-400 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {days.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }

              const daySchedules = getSchedulesForDate(day);
              const isToday =
                day.getUTCDate() === today.getUTCDate() &&
                day.getUTCMonth() === today.getUTCMonth() &&
                day.getUTCFullYear() === today.getUTCFullYear();
              const isPast = day.getTime() < today.getTime() && !isToday;

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => !isPast && handleDateClick(day)}
                  disabled={isPast}
                  className={`
                    p-2 rounded-lg border-2 transition-all h-32 flex flex-col
                    ${isPast ? 'bg-gray-900 border-gray-800 cursor-not-allowed opacity-50' : 'bg-gray-900 border-gray-700 hover:border-blue-500 cursor-pointer'}
                    ${isToday ? 'border-blue-500 bg-blue-900/20' : ''}
                  `}
                >
                  <div className="flex flex-col h-full w-full">
                    <span className={`text-sm font-medium ${isToday ? 'text-blue-400' : 'text-white'} flex-shrink-0`}>
                      {day.getUTCDate()}
                    </span>
                    <div className="flex-1 mt-1 space-y-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 #1F2937' }}>
                      {daySchedules.map(schedule => {
                        const timeString = getHourMinuteInTimezone(new Date(schedule.scheduled_for));

                        return (
                          <div
                            key={schedule.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingSchedule(schedule);
                            }}
                            className={`
                              text-xs px-1 py-0.5 rounded truncate cursor-pointer
                              ${schedule.status === 'published' ? 'bg-green-900/50 text-green-300' :
                                schedule.status === 'failed' ? 'bg-red-900/50 text-red-300' :
                                'bg-blue-900/50 text-blue-300'}
                              hover:brightness-125 transition-all
                            `}
                            title={`${schedule.template_name} - ${timeString}`}
                          >
                            {timeString} {schedule.template_name}
                          </div>
                        );
                      })}
                      {daySchedules.length > 3 && (
                        <div className="text-xs text-gray-500">+{daySchedules.length - 3}</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showAddModal && selectedDate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">
              Добавить публикацию
            </h3>
            <p className="text-gray-400 mb-4">
              Дата: <strong className="text-white">
                {selectedDate.toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
              </strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Шаблон
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white"
                >
                  <option value="">Выберите шаблон</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Время ({userTimezone})
                </label>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddSchedule}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg transition-colors font-medium"
              >
                <Plus className="w-4 h-4 inline mr-2" />
                Добавить
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedDate(null);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg transition-colors font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingSchedule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden border border-gray-700 flex flex-col">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {viewingSchedule.template_name}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {new Date(viewingSchedule.scheduled_for).toLocaleString('ru', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: userTimezone,
                  })}
                </p>
              </div>
              <button
                onClick={() => setViewingSchedule(null)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-3">
                {viewingSchedule.template_content?.map((text, idx) => (
                  <div key={idx} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-blue-400">
                        Пост {idx + 1}
                      </span>
                      <span className="text-xs text-gray-500">
                        {text.length} символов
                      </span>
                    </div>
                    <p className="text-white whitespace-pre-wrap">{text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Статус</p>
                    <p className="text-white font-medium capitalize">
                      {viewingSchedule.status === 'pending' && '⏳ Ожидает публикации'}
                      {viewingSchedule.status === 'published' && '✅ Опубликовано'}
                      {viewingSchedule.status === 'failed' && '❌ Ошибка'}
                      {viewingSchedule.status === 'cancelled' && '🚫 Отменено'}
                    </p>
                  </div>
                  {viewingSchedule.status === 'pending' && (
                    <button
                      onClick={async () => {
                        if (confirm('Удалить это расписание?')) {
                          await handleDeleteSchedule(viewingSchedule.id);
                          setViewingSchedule(null);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDayView && dayViewDate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[85vh] overflow-hidden border border-gray-700 flex flex-col">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white">
                  {dayViewDate.toLocaleDateString('ru', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {getSchedulesForDate(dayViewDate).length} публикаций запланировано
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedDate(dayViewDate);
                    setShowDayView(false);
                    setShowAddModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
                <button
                  onClick={() => {
                    setShowDayView(false);
                    setDayViewDate(null);
                  }}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-2">
                {Array.from({ length: 24 }, (_, hour) => {
                  const hourSchedules = getSchedulesForDate(dayViewDate).filter(s => {
                    const timeStr = getHourMinuteInTimezone(new Date(s.scheduled_for));
                    const scheduleHour = parseInt(timeStr.split(':')[0], 10);
                    return scheduleHour === hour;
                  }).sort((a, b) => {
                    const timeA = new Date(a.scheduled_for);
                    const timeB = new Date(b.scheduled_for);
                    return timeA.getTime() - timeB.getTime();
                  });

                  if (hourSchedules.length === 0) return null;

                  return (
                    <div key={hour} className="flex gap-4">
                      <div className="w-20 flex-shrink-0 text-right">
                        <span className="text-sm font-medium text-gray-400">
                          {String(hour).padStart(2, '0')}:00
                        </span>
                      </div>
                      <div className="flex-1 space-y-2">
                        {hourSchedules.map(schedule => {
                          const timeString = getHourMinuteInTimezone(new Date(schedule.scheduled_for));

                          return (
                            <button
                              key={schedule.id}
                              onClick={() => setViewingSchedule(schedule)}
                              className={`
                                w-full text-left p-4 rounded-lg border-2 transition-all
                                ${schedule.status === 'published'
                                  ? 'bg-green-900/30 border-green-700 hover:bg-green-900/40'
                                  : schedule.status === 'failed'
                                  ? 'bg-red-900/30 border-red-700 hover:bg-red-900/40'
                                  : 'bg-blue-900/30 border-blue-700 hover:bg-blue-900/40'}
                              `}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${
                                      schedule.status === 'published' ? 'text-green-300' :
                                      schedule.status === 'failed' ? 'text-red-300' :
                                      'text-blue-300'
                                    }`}>
                                      {timeString}
                                    </span>
                                    <span className="text-white font-semibold">
                                      {schedule.template_name}
                                    </span>
                                  </div>
                                  {schedule.template_content && schedule.template_content.length > 0 && (
                                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                      {schedule.template_content[0]}
                                    </p>
                                  )}
                                </div>
                                <div className="ml-4">
                                  {schedule.status === 'published' && (
                                    <span className="text-xs px-2 py-1 bg-green-900 text-green-300 rounded">
                                      Опубликовано
                                    </span>
                                  )}
                                  {schedule.status === 'failed' && (
                                    <span className="text-xs px-2 py-1 bg-red-900 text-red-300 rounded">
                                      Ошибка
                                    </span>
                                  )}
                                  {schedule.status === 'pending' && (
                                    <span className="text-xs px-2 py-1 bg-blue-900 text-blue-300 rounded">
                                      Ожидает
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {getSchedulesForDate(dayViewDate).length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">На этот день ничего не запланировано</p>
                  <button
                    onClick={() => {
                      setSelectedDate(dayViewDate);
                      setShowDayView(false);
                      setShowAddModal(true);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Добавить публикацию
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
