import type { Metadata } from "next";
import { BoardView } from "./board-view";

export const metadata: Metadata = { title: "訂餐儀表板" };

// Read-only view meant for the kitchen TV. Data loads and updates on the client.
export default function BoardPage() {
  return <BoardView />;
}
