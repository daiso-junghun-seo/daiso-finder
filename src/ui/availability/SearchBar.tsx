// src/ui/availability/SearchBar.tsx
import type { Ref } from 'react';
import { GlassSurface } from '../components/GlassSurface';

// The bottom-docked search/scan bar (L1 in Default; demoted to L4 once an answer exists). The parent
// owns input/retention semantics; this component owns only the form markup.
export function SearchBar({
  demoted,
  value,
  onChange,
  onSubmit,
  onOpenScanner,
  scanButtonRef,
  inputRef,
  inputLabel,
  placeholder,
  scanLabel,
}: {
  demoted: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onOpenScanner: () => void;
  scanButtonRef: Ref<HTMLButtonElement>;
  // Flow 3's re-search handoff fills the input and focuses it here (never auto-submits).
  inputRef?: Ref<HTMLInputElement>;
  inputLabel: string;
  placeholder: string;
  scanLabel: string;
}) {
  return (
    <GlassSurface className="search-bar-surface">
      <form
        className={demoted ? 'search-bar search-bar--demoted' : 'search-bar'}
        id="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="search-field">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M12.5 12.5 16.5 16.5" />
          </svg>
          <input
            ref={inputRef}
            aria-label={inputLabel}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <button
          ref={scanButtonRef}
          type="button"
          aria-label={scanLabel}
          className="text-label scan-button--primary"
          onClick={onOpenScanner}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M1 6V1h5M12 1h5v5M17 12v5h-5M6 17H1v-5" />
          </svg>
          {scanLabel}
        </button>
      </form>
    </GlassSurface>
  );
}
