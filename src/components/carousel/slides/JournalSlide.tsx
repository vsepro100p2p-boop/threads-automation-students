import { ChevronLeft } from 'lucide-react';
import EditableText from '../EditableText';
import type { CarouselSlideProps } from './types';

export default function JournalSlide({ isFirstPage, isCtaPage, title, body, intro_paragraph, points, blockquote_text, ctaTitle, ctaDescription, onUpdateContent }: Omit<CarouselSlideProps, 'design'>) {
  return (
    <div className="w-[375px] h-[469px] bg-white text-[#1c1c1e] overflow-hidden relative flex flex-col shadow-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="flex items-center justify-between px-5 py-3.5 relative z-10 shrink-0">
        <div className="flex items-center gap-1 text-[#E0B038]">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-[14px] font-normal leading-none">Назад</span>
        </div>
      </div>

      <div className="px-6 pb-5 flex-1 flex flex-col relative z-10 overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
        {isFirstPage ? (
          <div className="flex flex-col h-full justify-start pt-3">
            <EditableText
              value={title || ''}
              onChange={(val) => onUpdateContent('title', val)}
              className="text-[20px] font-bold leading-[1.25] text-[#1c1c1e] tracking-tight mb-4"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            />
            <div className="w-full h-px bg-gray-200 mb-5" />
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Пролистай вправо</span>
          </div>
        ) : isCtaPage ? (
          <div className="flex flex-col h-full justify-center items-center text-center">
            <EditableText
              value={ctaTitle || ''}
              onChange={(val) => onUpdateContent('ctaTitle', val)}
              className="text-[20px] font-extrabold mb-5 text-red-600 text-center leading-tight"
            />
            <div className="w-14 h-1 bg-gray-200 rounded-full mb-6" />
            <EditableText
              value={ctaDescription || ''}
              onChange={(val) => onUpdateContent('ctaDescription', val)}
              className="text-[13px] text-gray-700 leading-relaxed text-center max-w-[300px]"
            />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="shrink-0 mb-3">
              <EditableText
                value={title || ''}
                onChange={(val) => onUpdateContent('title', val)}
                className="text-[15px] font-extrabold text-[#1c1c1e] leading-[1.25]"
                style={{ fontFamily: 'Montserrat, sans-serif' }}
              />
            </div>
            {body ? (
              <div className="flex-grow overflow-y-auto min-h-0" style={{ scrollbarWidth: 'none' }}>
                <EditableText
                  value={body}
                  onChange={(val) => onUpdateContent('body', val)}
                  className="text-[13px] text-[#3a3a3a] leading-[1.55]"
                />
              </div>
            ) : (
              <>
                {intro_paragraph && (
                  <EditableText
                    value={intro_paragraph}
                    onChange={(val) => onUpdateContent('intro_paragraph', val)}
                  className="text-[13px] text-gray-700 leading-[1.45] mb-2.5 shrink-0"
                  />
                )}
                <div className="flex-grow flex flex-col justify-start gap-2.5 mb-2.5 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'none' }}>
                  {points?.map((point, i) => (
                    <div key={i} className="flex items-start text-[13px] text-[#1c1c1e] leading-[1.45]">
                      <span className="mr-2.5 mt-[5px] w-1.5 h-1.5 bg-[#1c1c1e] rounded-full shrink-0" />
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
                  <div className="shrink-0 mt-auto border-l-[3px] border-[#C5C5C7] pl-3.5 py-2">
                    <div className="text-[11px] text-gray-600 leading-[1.4] font-medium">
                      <EditableText
                        value={blockquote_text}
                        onChange={(val) => onUpdateContent('blockquote_text', val)}
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
