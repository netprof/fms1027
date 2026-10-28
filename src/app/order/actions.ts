"use server";

import {
  isLineArray,
  loadOrderView,
  parseOrderKey,
  type OrderView,
} from "@/lib/order-view";
import { placeCustomerOrder, type OrderLine, type WriteResult } from "@/lib/orders";

export async function loadOrder(
  siteId: number,
  date: string,
  slot: string,
): Promise<OrderView | { error: string }> {
  const key = parseOrderKey(siteId, date, slot);
  if (!key) return { error: "參數不正確" };
  return loadOrderView(key);
}

export async function submitOrder(
  siteId: number,
  date: string,
  slot: string,
  lines: OrderLine[],
): Promise<WriteResult> {
  const key = parseOrderKey(siteId, date, slot);
  if (!key || !isLineArray(lines)) return { ok: false, error: "參數不正確" };
  return placeCustomerOrder(key, lines, "customer_web");
}
