// src/ui/a11y/LiveRegion.tsx
export function LiveRegion({ message }: { message: string }) {
  return (
    <div aria-live="polite" role="status">
      {message}
    </div>
  );
}
