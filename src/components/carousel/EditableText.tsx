import { useState, useRef, useEffect } from 'react';

interface EditableTextProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

export default function EditableText({ value, onChange, className, style, placeholder }: EditableTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  useEffect(() => { resize(); }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize(); }}
      rows={1}
      placeholder={placeholder}
      className={`bg-transparent border-none outline-none resize-none overflow-hidden w-full p-0 m-0 focus:ring-1 focus:ring-dashed focus:ring-gray-400/50 rounded-sm ${className}`}
      style={style}
    />
  );
}
