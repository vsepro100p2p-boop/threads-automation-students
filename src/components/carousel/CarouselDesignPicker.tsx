import type { CarouselDesign } from './carouselTypes';

interface CarouselDesignPickerProps {
  selectedDesign: CarouselDesign;
  onSelectDesign: (design: CarouselDesign) => void;
}

export default function CarouselDesignPicker({ selectedDesign, onSelectDesign }: CarouselDesignPickerProps) {
  // Only one design — Classic Notes, auto-selected
  if (selectedDesign !== 'notes') {
    onSelectDesign('notes');
  }
  return null;
}
