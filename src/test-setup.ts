// Vitest 5 no longer exposes the `jest` matcher namespace the package's root entry augments;
// the /vitest entry is what extends Vitest's own Assertion type (and does the runtime install).
import '@testing-library/jest-dom/vitest';
import { loadLocaleTable } from './i18n/strings';

// The suite runs in Korean: component copy resolves the device language, and jsdom's
// default navigator.language is en-US — without this pin every surface test would boot
// English. English is covered by dedicated locale tests, not by accident here.
Object.defineProperty(window.navigator, 'language', { value: 'ko-KR', configurable: true });

// §B52: every table except ko is a lazy chunk. English is the one non-ko table many suites
// exercise through the locale select, so keep it resident here — those switches stay
// synchronous as before. Suites that assert other languages preload them themselves.
await loadLocaleTable('en');
