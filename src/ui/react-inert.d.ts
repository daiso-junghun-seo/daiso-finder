// src/ui/react-inert.d.ts
// React 18's DOM typings omit the standard `inert` attribute (React 19 adds it as a boolean).
// React 18 only renders string-valued unknown attributes through to the DOM, so model it as
// '' | undefined: '' sets the attribute, undefined omits it (the established React 18 pattern).
import 'react';

declare module 'react' {
  interface HTMLAttributes<T> {
    inert?: '' | undefined;
  }
}
