// Price tiers take categorical slots in fixed order, highest price first.
// The first three are validated all-pairs for colour-vision deficiency.
// Shared by the kitchen board and the drivers' route page.
export const TIER_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
];
export const CUSTOM_PRICE_COLOR = "#6b6a65";

// tiers: highest first, as the board API returns them.
export function priceColor(tiers: number[], price: number): string {
  const i = tiers.indexOf(price);
  return i < 0 ? CUSTOM_PRICE_COLOR : TIER_COLORS[i % TIER_COLORS.length];
}
