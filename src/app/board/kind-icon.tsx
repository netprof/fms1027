import { KIND_LABEL, type MealKind } from "@/lib/meals";

// One small glyph per meal kind; the colour (currentColor) carries the price.
export function KindIcon({
  kind,
  color,
  className = "h-4 w-4",
}: {
  kind: MealKind;
  color: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ color }}
      fill="currentColor"
      role="img"
      aria-label={KIND_LABEL[kind]}
    >
      <title>{KIND_LABEL[kind]}</title>
      {GLYPHS[kind]}
    </svg>
  );
}

const GLYPHS: Record<MealKind, React.ReactNode> = {
  // Drumstick
  meat_a: (
    <path d="M15 2.5a6.5 6.5 0 0 0-6.2 8.5l-4 4a2.3 2.3 0 1 0-1.7 3.4 2.3 2.3 0 1 0 3.4-1.7l4-4A6.5 6.5 0 1 0 15 2.5z" />
  ),
  // Leaf
  veg_a: (
    <path d="M21 3C10 3 3.5 8.5 3.5 16c0 1.6.3 3 .9 4.3C5.6 16 9 12 14 10c-4.2 3.1-6.8 7-7.7 11 1.1.4 2.3.6 3.6.6C17 21.6 21 15 21 3z" />
  ),
  // Pig snout, struck through
  no_pork: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <ellipse cx="9.2" cy="12" rx="1.4" ry="2" />
      <ellipse cx="14.8" cy="12" rx="1.4" ry="2" />
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  // Boxed B
  b: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M8.3 6.5h4.5c2.3 0 3.6 1.1 3.6 2.8 0 1.2-.7 2-1.7 2.4 1.4.3 2.3 1.3 2.3 2.7 0 2-1.5 3.1-3.9 3.1H8.3zm2.4 4.4h1.8c1 0 1.5-.5 1.5-1.2s-.5-1.2-1.5-1.2h-1.8zm0 4.6h2c1.1 0 1.7-.5 1.7-1.3s-.6-1.3-1.7-1.3h-2z"
      />
    </>
  ),
  // Star
  other: (
    <path d="M12 2.3l2.9 6.1 6.7.8-5 4.6 1.3 6.6L12 17.1l-5.9 3.3 1.3-6.6-5-4.6 6.7-.8z" />
  ),
};
