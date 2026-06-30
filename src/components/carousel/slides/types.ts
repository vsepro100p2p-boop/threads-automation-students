import type { CarouselDesign, UserProfile } from '../carouselTypes';

export interface CarouselSlideProps {
  design: CarouselDesign;
  userProfile: UserProfile;
  isFirstPage?: boolean;
  isCtaPage?: boolean;
  title?: string;
  body?: string;
  intro_paragraph?: string;
  points?: string[];
  blockquote_text?: string;
  ctaTitle?: string;
  ctaDescription?: string;
  slideIndex: number;
  totalSlides: number;
  onUpdateContent: (field: string, value: any) => void;
}
