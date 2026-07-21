// src/ui/components/GlassSurface.tsx
import type { PropsWithChildren, Ref } from 'react';
import '../../styles/glass.css';

export function GlassSurface({
  as: Tag = 'div',
  children,
  className = '',
  tabIndex,
  surfaceRef,
}: PropsWithChildren<{
  as?: 'div' | 'section';
  className?: string;
  tabIndex?: number;
  surfaceRef?: Ref<HTMLDivElement>;
}>) {
  return (
    <Tag
      ref={surfaceRef}
      tabIndex={tabIndex}
      className={`glass-surface ${className}`.trim()}
      data-solid-base="true"
    >
      {children}
    </Tag>
  );
}
