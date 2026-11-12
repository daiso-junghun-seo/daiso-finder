// src/ui/components/GlassSurface.tsx
import type { PropsWithChildren, Ref } from 'react';
import '../../styles/glass.css';

export function GlassSurface({
  as: Tag = 'div',
  children,
  className = '',
  tabIndex,
  surfaceRef,
  hidden,
}: PropsWithChildren<{
  as?: 'div' | 'section';
  className?: string;
  tabIndex?: number;
  surfaceRef?: Ref<HTMLDivElement>;
  // Keeps a surface mounted (its state intact) while another flow owns the screen. The explicit
  // .answer-card[hidden] rule in layout.css makes the attribute win over the card's display:flex.
  hidden?: boolean;
}>) {
  return (
    <Tag
      ref={surfaceRef}
      tabIndex={tabIndex}
      className={`glass-surface ${className}`.trim()}
      data-solid-base="true"
      hidden={hidden}
    >
      {children}
    </Tag>
  );
}
