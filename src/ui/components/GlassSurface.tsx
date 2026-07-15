// src/ui/components/GlassSurface.tsx
import type { PropsWithChildren } from 'react';
import '../../styles/glass.css';

export function GlassSurface({
  children,
  className = '',
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`glass-surface ${className}`.trim()} data-solid-base="true">
      {children}
    </div>
  );
}
