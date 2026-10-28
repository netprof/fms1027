import { Roboto } from "next/font/google";

// Back-office font (Ultima uses Roboto); Chinese falls back to the system
// CJK font via --font-admin in globals.css.
export const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});
