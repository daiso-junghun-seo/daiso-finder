// src/ui/components/ProductPhoto.tsx
// Renders the product photo when the vendor supplied one; never a fake placeholder when absent (honest,
// no fabricated imagery — empty-slot styling is UI-polish follow-up). alt = product name (Bible §접근성).
// Shared by AnswerCard (answer states) and CandidateList (pre-answer candidate rows) — one <img>, no duplication.
export function ProductPhoto({ imageUrl, name }: { imageUrl?: string; name: string }) {
  if (!imageUrl) return null;
  return <img className="product-photo" src={imageUrl} alt={name} />;
}
