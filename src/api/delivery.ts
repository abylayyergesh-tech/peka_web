/** Развозка: рейсы курьеров и их точки. DTO повторяют app/delivery/schemas.py.
 *
 *  Маршрут собирают из адресов завтрашних заказов, курьера привязывают потом.
 *  Склада и денег здесь нет: отметка «доставлено» — факт логистики, выдачу
 *  проводит касса. */
import { api } from "@/api/client";

export type RouteStatus = "planned" | "in_progress" | "done" | "cancelled";
export type StopStatus = "pending" | "delivered" | "failed";

export interface CourierOut {
  employee_id: number;
  full_name: string;
  position: string | null;
  department_name: string | null;
}

export interface DeliveryOrderLine {
  name: string;
  quantity: string;
}

export interface DeliveryCandidate {
  order_id: number;
  number: number | null;
  status: string;
  customer_id: number | null;
  customer_address_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  entrance_comment: string | null;
  point_key: string;
  is_extra: boolean;
  requested_for: string | null;
  total: string;
  items: DeliveryOrderLine[];
}

export interface DeliveryStopOut {
  delivery_stop_id: number;
  order_id: number;
  position: number;
  status: StopStatus;
  delivered_at: string | null;
  note: string | null;
  order_number: number | null;
  customer_id: number | null;
  customer_address_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  entrance_comment: string | null;
  point_key: string;
  is_extra: boolean;
  requested_for: string | null;
  total: string;
  items: DeliveryOrderLine[];
}

export interface DeliveryRouteOut {
  delivery_route_id: number;
  route_date: string;
  courier_employee_id: number | null;
  courier_name: string | null;
  name: string | null;
  status: RouteStatus;
  started_at: string | null;
  finished_at: string | null;
  note: string | null;
  stops_total: number;
  stops_delivered: number;
  stops_failed: number;
  stops: DeliveryStopOut[];
}

export interface DeliveryAssignmentOut {
  customer_id: number | null;
  customer_address_id: number | null;
  customer_name: string | null;
  delivery_address: string | null;
  point_key: string;
  delivery_route_id: number;
  route_name: string | null;
  courier_employee_id: number | null;
  courier_name: string | null;
}

export interface DeliveryLogRow {
  delivery_stop_id: number;
  delivery_route_id: number;
  route_date: string;
  route_name: string | null;
  courier_employee_id: number | null;
  courier_name: string | null;
  marked_by_name: string | null;
  delivered_at: string | null;
  status: StopStatus;
  note: string | null;
  customer_id: number | null;
  customer_address_id: number | null;
  customer_name: string | null;
  delivery_address: string | null;
  entrance_comment: string | null;
  order_id: number;
  order_number: number | null;
  is_extra: boolean;
  items: DeliveryOrderLine[];
}

export async function listCouriers(): Promise<CourierOut[]> {
  const { data } = await api.get<CourierOut[]>("/delivery/couriers");
  return data;
}

export async function listCandidates(date: string): Promise<DeliveryCandidate[]> {
  const { data } = await api.get<DeliveryCandidate[]>("/delivery/candidates", {
    params: { date },
  });
  return data;
}

export async function listAssignments(date: string): Promise<DeliveryAssignmentOut[]> {
  const { data } = await api.get<DeliveryAssignmentOut[]>("/delivery/assignments", {
    params: { date },
  });
  return data;
}

export async function listDeliveryLogs(params: {
  date_from: string;
  date_to: string;
  courier?: number;
  customer_id?: number;
  status?: StopStatus;
  q?: string;
}): Promise<DeliveryLogRow[]> {
  const { data } = await api.get<DeliveryLogRow[]>("/delivery/logs", { params });
  return data;
}

export async function listRoutes(params: {
  date?: string;
  courier?: number;
  status?: RouteStatus;
  assigned?: boolean;
}): Promise<DeliveryRouteOut[]> {
  const { data } = await api.get<DeliveryRouteOut[]>("/delivery/routes", { params });
  return data;
}

export async function createRoute(body: {
  route_date: string;
  courier_employee_id?: number | null;
  name?: string | null;
  note?: string | null;
  order_ids?: number[];
}): Promise<DeliveryRouteOut> {
  const { data } = await api.post<DeliveryRouteOut>("/delivery/routes", body);
  return data;
}

export async function updateRoute(
  id: number,
  body: {
    name?: string | null;
    status?: RouteStatus;
    note?: string | null;
  },
): Promise<DeliveryRouteOut> {
  const { data } = await api.patch<DeliveryRouteOut>(`/delivery/routes/${id}`, body);
  return data;
}

export async function setRouteStops(
  id: number,
  orderIds: number[],
): Promise<DeliveryRouteOut> {
  const { data } = await api.put<DeliveryRouteOut>(`/delivery/routes/${id}/stops`, {
    order_ids: orderIds,
  });
  return data;
}

export async function deleteRoute(id: number): Promise<void> {
  await api.delete(`/delivery/routes/${id}`);
}

export async function assignCourier(
  id: number,
  courierEmployeeId: number | null,
): Promise<DeliveryRouteOut> {
  const { data } = await api.post<DeliveryRouteOut>(`/delivery/routes/${id}/assign`, {
    courier_employee_id: courierEmployeeId,
  });
  return data;
}

export async function markStop(
  stopId: number,
  body: { status: StopStatus; note?: string | null },
): Promise<DeliveryStopOut> {
  const { data } = await api.post<DeliveryStopOut>(
    `/delivery/stops/${stopId}/mark`,
    body,
  );
  return data;
}
