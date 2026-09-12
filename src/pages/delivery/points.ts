/** Группировка заказов в точки: один адрес — одна строка конструктора. */
import type { DeliveryCandidate, DeliveryStopOut } from "@/api/delivery";

export interface DeliveryPoint {
  point_key: string;
  customer_address_id: number | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  entrance_comment: string | null;
  is_extra: boolean;
  order_ids: number[];
  orders: DeliveryCandidate[];
}

export function groupCandidates(rows: DeliveryCandidate[]): DeliveryPoint[] {
  const map = new Map<string, DeliveryPoint>();
  const order: string[] = [];
  for (const row of rows) {
    const key = row.point_key || `o:${row.order_id}`;
    let point = map.get(key);
    if (!point) {
      point = {
        point_key: key,
        customer_address_id: row.customer_address_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        delivery_address: row.delivery_address,
        entrance_comment: row.entrance_comment,
        is_extra: row.is_extra,
        order_ids: [],
        orders: [],
      };
      map.set(key, point);
      order.push(key);
    }
    point.order_ids.push(row.order_id);
    point.orders.push(row);
    if (row.is_extra) point.is_extra = true;
    if (!point.entrance_comment && row.entrance_comment) {
      point.entrance_comment = row.entrance_comment;
    }
  }
  return order.map((key) => map.get(key)!);
}

export function stopBlocks(stops: DeliveryStopOut[]): DeliveryStopOut[][] {
  const blocks: DeliveryStopOut[][] = [];
  for (const stop of stops) {
    const key = stop.point_key || `o:${stop.order_id}`;
    const last = blocks[blocks.length - 1];
    const lastKey = last ? last[0].point_key || `o:${last[0].order_id}` : null;
    if (last && lastKey === key) last.push(stop);
    else blocks.push([stop]);
  }
  return blocks;
}

export function orderIdsOfBlocks(blocks: DeliveryStopOut[][]): number[] {
  return blocks.flatMap((block) => block.map((s) => s.order_id));
}

export function itemsLine(items: { name: string; quantity: string }[]): string {
  if (items.length === 0) return "—";
  return items.map((i) => `${i.name} × ${Number(i.quantity)}`).join(", ");
}
