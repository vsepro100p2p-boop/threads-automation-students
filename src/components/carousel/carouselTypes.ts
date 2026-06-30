export interface CarouselPage {
  title: string;
  body?: string;
  intro_paragraph?: string;
  points?: string[];
  blockquote_text?: string;
}

export interface CallToActionPage {
  title: string;
  description: string;
}

export interface CarouselContent {
  first_page_title: string;
  content_pages: CarouselPage[];
  call_to_action_page: CallToActionPage;
}

export type CarouselDesign = 'notes' | 'journal' | 'influencer' | 'notes-dark';

export interface UserProfile {
  name: string;
  handle: string;
  avatarUrl: string | null;
}

export type Slide =
  | ({ type: 'first' } & { title: string })
  | ({ type: 'content' } & CarouselPage)
  | ({ type: 'cta' } & CallToActionPage);

export type CTAType = 'custom' | 'subscribe';
export type ContentStyle = 'prose' | 'practical';
