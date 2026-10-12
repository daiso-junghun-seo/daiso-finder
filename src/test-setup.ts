import '@testing-library/jest-dom';

// The suite runs in Korean: component copy resolves the device language, and jsdom's
// default navigator.language is en-US — without this pin every surface test would boot
// English. English is covered by dedicated locale tests, not by accident here.
Object.defineProperty(window.navigator, 'language', { value: 'ko-KR', configurable: true });
