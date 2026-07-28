// src/ui/a11y/LiveRegion.tsx
export function LiveRegion({
  message,
  visuallyHidden = false,
}: {
  message: string;
  // Opt-in per call site: on surfaces where the same sentence is already on screen, rendering it twice
  // is noise. Never turn this on where the live region is the only source of a line.
  visuallyHidden?: boolean;
}) {
  return (
    <div
      aria-live="polite"
      role="status"
      className={visuallyHidden ? 'visually-hidden' : undefined}
    >
      {message}
    </div>
  );
}
