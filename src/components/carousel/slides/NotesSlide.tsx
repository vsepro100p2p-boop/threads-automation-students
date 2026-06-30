import { ChevronLeft, MoreHorizontal, Upload } from 'lucide-react';
import EditableText from '../EditableText';
import type { CarouselSlideProps } from './types';

export default function NotesSlide({ isFirstPage, isCtaPage, title, body, intro_paragraph, points, blockquote_text, ctaTitle, ctaDescription, onUpdateContent, userProfile }: Omit<CarouselSlideProps, 'design'>) {
  return (
    <div className="w-[375px] h-[469px] bg-[#FBFBF8] text-[#2D2D2D] overflow-hidden relative flex flex-col shadow-2xl" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Notes header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 text-amber-500 relative z-10 shrink-0">
        <div className="flex items-center text-[13px] font-medium cursor-default">
          <ChevronLeft className="w-4 h-4" />
          <span className="ml-0.5">Заметки</span>
        </div>
        <div className="flex space-x-3">
          <Upload className="w-4 h-4" />
          <MoreHorizontal className="w-4 h-4" />
        </div>
      </div>

      <div className="px-6 pt-1 pb-5 flex-1 flex flex-col relative z-10 overflow-hidden">
        {isFirstPage ? (
          <div className="flex flex-col h-full justify-start pt-3">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Сегодня, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <EditableText
              value={title || ''}
              onChange={(val) => onUpdateContent('title', val)}
              className="text-[20px] font-bold leading-[1.25] text-[#1a1a1a] tracking-[-0.01em] mb-5"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            />
            <div className="w-10 h-[3px] bg-amber-400/50 rounded-full mb-5" />
            <p className="text-[10px] text-gray-400" style={{ fontFamily: "'Inter', sans-serif" }}>@{userProfile.handle.replace('@', '')}</p>
          </div>
        ) : isCtaPage ? (
          <div className="flex flex-col h-full justify-center items-center text-center gap-3">
            <div className="text-2xl mb-2">✍️</div>
            <EditableText
              value={ctaTitle || ''}
              onChange={(val) => onUpdateContent('ctaTitle', val)}
              className="text-[20px] font-extrabold text-[#1a1a1a] text-center tracking-tight"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            />
            <EditableText
              value={ctaDescription || ''}
              onChange={(val) => onUpdateContent('ctaDescription', val)}
              className="text-[13px] text-gray-500 leading-relaxed text-center max-w-[260px]"
            />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Title */}
            <EditableText
              value={title || ''}
              onChange={(val) => onUpdateContent('title', val)}
              className="text-[15px] font-bold text-[#1a1a1a] mb-2.5 leading-[1.25] shrink-0"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            />

            {body ? (
              <div className="flex-grow overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                <EditableText
                  value={body}
                  onChange={(val) => onUpdateContent('body', val)}
                  className="text-[13px] text-[#3a3a3a] leading-[1.55]"
                />
              </div>
            ) : (
              <>
                {/* Intro paragraph - "Думал — X. Оказалось — Y." */}
                {intro_paragraph && (
                  <EditableText
                    value={intro_paragraph}
                    onChange={(val) => onUpdateContent('intro_paragraph', val)}
                    className="text-[13px] text-[#555] leading-[1.45] mb-3 shrink-0"
                  />
                )}

                {/* Bullet points */}
                <div className="flex-grow flex flex-col gap-2.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {points?.map((point, i) => (
                    <div key={i} className="flex items-start text-[13px] text-[#2D2D2D] leading-[1.5]">
                      <span className="text-amber-500 mr-2 mt-[3px] shrink-0 text-[7px]">&#9679;</span>
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

                {/* Blockquote at bottom */}
                {blockquote_text && (
                  <div className="shrink-0 mt-auto pt-4">
                    <div className="py-2.5 px-4 bg-[#FFF8E1] rounded-xl">
                      <EditableText
                        value={blockquote_text}
                        onChange={(val) => onUpdateContent('blockquote_text', val)}
                        className="text-[11px] text-[#5a5a5a] text-center leading-[1.45]"
                        style={{ fontFamily: "'Inter', sans-serif", fontStyle: 'italic' }}
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
