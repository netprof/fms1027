import {
  Beef,
  Drumstick,
  Ham,
  Leaf,
  PencilLine,
  Soup,
  type LucideIcon,
} from "lucide-react";
import { KIND_LABEL, type MealKind } from "@/lib/meals";

// One glyph per meal kind. "No pork" / "no beef" are the food glyph with a
// slash. Colour comes from the caller (price on the board, ink in tables).
const GLYPHS: Record<MealKind, { icon: LucideIcon; slash?: boolean }> = {
  meat_a: { icon: Drumstick },
  veg_a: { icon: Leaf },
  no_pork: { icon: Ham, slash: true },
  no_beef: { icon: Beef, slash: true },
  b: { icon: Soup },
  other: { icon: PencilLine },
};

export function KindIcon({
  kind,
  color = "currentColor",
  size = 16,
}: {
  kind: MealKind;
  color?: string;
  size?: number;
}) {
  const { icon: Icon, slash } = GLYPHS[kind];
  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ color, width: size, height: size }}
      role="img"
      aria-label={KIND_LABEL[kind]}
      title={KIND_LABEL[kind]}
    >
      <Icon size={size} strokeWidth={2.25} aria-hidden />
      {slash && (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className="absolute inset-0"
          aria-hidden
        >
          <line
            x1="3"
            y1="3"
            x2="21"
            y2="21"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}
