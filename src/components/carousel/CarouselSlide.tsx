import type { CarouselSlideProps } from './slides/types';
import JournalSlide from './slides/JournalSlide';
import NotesSlide from './slides/NotesSlide';
import NotesDarkSlide from './slides/NotesDarkSlide';
import InfluencerSlide from './slides/InfluencerSlide';

export type { CarouselSlideProps };

export default function CarouselSlide(props: CarouselSlideProps) {
  switch (props.design) {
    case 'journal':
      return <JournalSlide {...props} />;
    case 'notes':
      return <NotesSlide {...props} />;
    case 'notes-dark':
      return <NotesDarkSlide {...props} />;
    case 'influencer':
      return <InfluencerSlide {...props} />;
    default:
      return <NotesSlide {...props} />;
  }
}
