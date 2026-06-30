import { ChevronLeft, MoreHorizontal, Upload } from 'lucide-react';
import EditableText from '../EditableText';
import type { CarouselSlideProps } from './types';

export default function NotesDarkSlide({ isFirstPage, isCtaPage, title, body, intro_paragraph, points, blockquote_text, ctaTitle, ctaDescription, onUpdateContent, userProfile }: Omit<CarouselSlideProps, 'design'>) {
  return (
    <div className="w-[375px] h-[469px] bg-[#1c1c1e] text-white overflow-hidden relative flex flex-col shadow-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
      {userProfile.avatarUrl && (
        <div className="absolute inset-0 z-0">
          <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
          {isFirstPage ? (
            <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/30 to-black" />
          ) : (
            <div className="absolute inset-0 bg-[#1c1c1e]/95" />
          )}
        </div>
      )}

      <div className="flex items-center justify-between p-5 text-amber-500 relative z-10 shrink-0">
        <div className="flex items-center text-[13px] font-medium cursor-default drop-shadow-sm">
          <ChevronLeft className="w-4 h-4" />
          <span className="ml-1 truncate max-w-[150px]">Заметки</span>
        </div>
        <div className="flex space-x-3 drop-shadow-sm">
          <Upload className="w-4 h-4" />
          <MoreHorizontal className="w-4 h-4" />
        </div>
      </div>

      <div className="px-7 pt-1 pb-6 flex-1 flex flex-col relative z-10 overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
        {isFirstPage ? (
          <div className="flex flex-col h-full justify-end pb-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 drop-shadow-md">
              Сегодня, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <EditableText
              value={title || ''}
              onChange={(val) => onUpdateContent('title', val)}
              className="text-[20px] font-bold leading-[1.25] text-white tracking-tight mb-5 drop-shadow-lg"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            />
            <div className="w-12 h-1 bg-amber-500/80 rounded-full mb-5 shadow-lg" />
            <p className="text-[10px] text-gray-300 drop-shadow-md font-semibold">@{userProfile.handle.replace('@', '')}</p>
          </div>
        ) : isCtaPage ? (
          <div className="flex flex-col h-full justify-center items-center text-center">
            <EditableText
              value={ctaTitle || ''}
              onChange={(val) => onUpdateContent('ctaTitle', val)}
              className="text-[20px] font-bold mb-3 text-white text-center"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            />
            <EditableText
              value={ctaDescription || ''}
              onChange={(val) => onUpdateContent('ctaDescription', val)}
              className="text-[13px] text-gray-400 leading-relaxed text-center max-w-[260px]"
            />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <EditableText
              value={title || ''}
              onChange={(val) => onUpdateContent('title', val)}
              className="text-[15px] font-bold text-white mb-3 leading-[1.2] shrink-0"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            />
            {body ? (
              <div className="flex-grow overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                <EditableText
                  value={body}
                  onChange={(val) => onUpdateContent('body', val)}
                  className="text-[13px] text-gray-200 leading-[1.55]"
                />
              </div>
            ) : (
              <>
                {intro_paragraph && (
                  <EditableText
                    value={intro_paragraph}
                    onChange={(val) => onUpdateContent('intro_paragraph', val)}
                    className="text-[13px] text-gray-300 leading-[1.45] mb-3 shrink-0"
                  />
                )}
                <div className="flex-grow flex flex-col gap-2.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {points?.map((point, i) => (
                    <div key={i} className="flex items-start text-[13px] text-gray-200 leading-[1.5]">
                      <span className="text-amber-500 mr-2 mt-[3px] shrink-0 text-[7px]">&#8226;</span>
                      <EditableText
                        value={point}
                        onChange={(val) => {
                          const newPoints = [...(points || [])];
                          newPoints[i] = val;
                          onUpdateContent('points', newPoints);
                        }}
                      />
                    </div>
                  ))}
                </div>
                {blockquote_text && (
                  <div className="shrink-0 mt-auto pt-3">
                    <div className="p-2.5 bg-white/5 rounded-lg border border-white/10">
                      <EditableText
                        value={blockquote_text}
                        onChange={(val) => onUpdateContent('blockquote_text', val)}
                        className="text-[11px] text-gray-400 italic text-center leading-[1.4]"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
