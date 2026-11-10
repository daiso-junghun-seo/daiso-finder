// src/ui/components/ProductPhoto.tsx
// Renders the product photo when the vendor supplied one; never a fake placeholder when absent (honest,
// no fabricated imagery — empty-slot styling is UI-polish follow-up). alt = product name (Bible §접근성).
// Shared by AnswerCard (answer states) and CandidateList (pre-answer candidate rows) — one <img>, no duplication.
//
// A URL that fails to load unmounts the same way: a broken-image glyph with spilled alt text is worse
// than no photo (UI polish screenshot, 2026-10-12 — and a vendor 404 in production is the same case).
// Flow 2 passes a `fallback` slot: its Bible Partial says the identity note replaces the thumbnail
// (Interface/in-store-navigation.md §4b), so absence must carry a sentence there, not just whitespace.
import { type ReactNode, useState } from 'react';

export function ProductPhoto({
  imageUrl,
  name,
  fallback = null,
}: {
  imageUrl?: string;
  name: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) return fallback;
  return (
    <img className="product-photo" src={imageUrl} alt={name} onError={() => setFailed(true)} />
  );
}
