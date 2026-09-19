/** Точки маршрута: одна запись справочника — одна строка конструктора. */
import type { DeliveryStopOut } from "@/api/delivery";

export function addressIdsOfStops(stops: DeliveryStopOut[]): number[] {
  return stops
    .map((s) => s.customer_address_id)
    .filter((id): id is number => id != null);
}

export function itemsLine(items: { name: string; quantity: string }[]): string {
  if (items.length === 0) return "—";
  return items.map((i) => `${i.name} × ${Number(i.quantity)}`).join(", ");
}
