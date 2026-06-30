import { Share2, Bookmark } from 'lucide-react';
import EditableText from '../EditableText';
import type { CarouselSlideProps } from './types';

export default function InfluencerSlide({ isFirstPage, isCtaPage, title, body, intro_paragraph, points, blockquote_text, ctaTitle, ctaDescription, slideIndex, totalSlides, onUpdateContent, userProfile }: Omit<CarouselSlideProps, 'design'>) {
  return (
    <div className="w-[375px] h-[469px] bg-[#111] text-white overflow-hidden relative flex flex-col shadow-2xl select-none" style={{ fontFamily: 'Inter, sans-serif' }}>
      {userProfile.avatarUrl && (
        <div className="absolute inset-0 z-0">
          <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
          {isFirstPage ? (
            <>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/95" />
              <div className="absolute inset-0 bg-black/10" />
            </>
          ) : (
            <div className="absolute inset-0 bg-black/90" />
          )}
        </div>
      )}

      {!isFirstPage && (
        <div className="relative z-10 px-7 pt-4 mb-0 shrink-0 text-right">
          <div className="inline-block">
            <p className="text-[9px] font-medium tracking-wide text-gray-400 uppercase">
              {slideIndex + 1}/{totalSlides}
            </p>
          </div>
        </div>
      )}

      <div className="px-7 pt-2 pb-6 flex-1 flex flex-col relative z-10 overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
        {isFirstPage ? (
          <div className="flex flex-col justify-end h-full pb-6">
            <EditableText
              value={title || ''}
              onChange={(val) => onUpdateContent('title', val)}
              className="text-[20px] font-bold leading-[1.2] text-white tracking-tight text-left drop-shadow-2xl"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
              placeholder="Заголовок..."
            />
          </div>
        ) : isCtaPage ? (
          <div className="flex flex-col h-full justify-center items-center text-center">
            <EditableText
              value={ctaTitle || ''}
              onChange={(val) => onUpdateContent('ctaTitle', val)}
              className="text-[20px] font-bold text-white uppercase leading-none mb-3"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            />
            <div className="p-3.5 border border-white/20 bg-white/5 backdrop-blur-sm rounded-xl">
              <EditableText
                value={ctaDescription || ''}
                onChange={(val) => onUpdateContent('ctaDescription', val)}
                className="text-[13px] text-white font-medium leading-relaxed max-w-[260px]"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            <EditableText
              value={title || ''}
              onChange={(val) => onUpdateContent('title', val)}
              className="text-[15px] font-bold text-white mb-3 leading-[1.2] shrink-0"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            />
            {body ? (
              <div className="flex-grow overflow-y-auto min-h-0" style={{ scrollbarWidth: 'none' }}>
                <EditableText
                  value={body}
                  onChange={(val) => onUpdateContent('body', val)}
                  className="text-[13px] text-gray-200 leading-[1.55]"
                />
              </div>
            ) : (
              <>
                <div className="flex-grow flex flex-col gap-2.5 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'none' }}>
                  {intro_paragraph && (
                    <EditableText
                      value={intro_paragraph}
                      onChange={(val) => onUpdateContent('intro_paragraph', val)}
                      className="text-[13px] text-gray-200 leading-[1.45] shrink-0"
                    />
                  )}
                  {points?.map((point, i) => (
                    <div key={i} className="flex items-start text-[13px] text-gray-200 leading-[1.5]">
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
                    <div className="p-2.5 bg-white/10 rounded-sm border-l-4 border-white">
                      <EditableText
                        value={blockquote_text}
                        onChange={(val) => onUpdateContent('blockquote_text', val)}
                        className="text-[11px] text-white font-semibold leading-snug"
                        style={{ fontFamily: 'Montserrat, sans-serif' }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {(isFirstPage || isCtaPage) && (
        <div className="relative z-20 mt-auto shrink-0">
          <div className="h-px bg-white/20 mb-2 mx-7 w-[calc(100%-56px)]" />
          <div className="flex items-center justify-between px-7 pb-4 text-white">
            <div className="flex items-center gap-2">
              <Share2 className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Поделиться</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium">Сохранить</span>
              <Bookmark className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
