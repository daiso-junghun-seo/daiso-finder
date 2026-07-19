// src/ui/components/GlassSurface.test.tsx
import { render } from '@testing-library/react';
import { GlassSurface } from './GlassSurface';

test('renders a solid base surface with the contrast-guarantee layer', () => {
  const { container } = render(<GlassSurface>답</GlassSurface>);
  const el = container.firstChild as HTMLElement;
  expect(el).toHaveClass('glass-surface');
  expect(el.dataset.solidBase).toBe('true'); // solid is the base; glass is progressive enhancement
});

test('default element stays a <div> with the solid-base marker', () => {
  const { container } = render(<GlassSurface>답</GlassSurface>);
  const el = container.firstChild as HTMLElement;
  expect(el.tagName).toBe('DIV');
  expect(el.dataset.solidBase).toBe('true');
});

test('as="section" renders a <section> with the solid-base marker (G5)', () => {
  const { container } = render(<GlassSurface as="section">답</GlassSurface>);
  const el = container.firstChild as HTMLElement;
  expect(el.tagName).toBe('SECTION');
  expect(el.dataset.solidBase).toBe('true');
});
