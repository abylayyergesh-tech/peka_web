/** Развозка: постоянные шаблоны маршрутов из точек клиента.
 *  DTO повторяют app/delivery/schemas.py.
 *
 *  Маршрут заводят один раз из точек справочника, правят и назначают курьеру.
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

export interface DeliveryPointOut {
  customer_address_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string | null;
  label: string | null;
  delivery_address: string;
  entrance_comment: string | null;
  point_key: string;
}

export interface DeliveryStopOut {
  delivery_stop_id: number;
  order_id: number | null;
  position: number;
  status: StopStatus;
  delivered_at: string | null;
  note: string | null;
  order_number: number | null;
  customer_id: number | null;
  customer_address_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  label: string | null;
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
  route_date: string | null;
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
  route_date: string | null;
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
  order_id: number | null;
  order_number: number | null;
  is_extra: boolean;
  items: DeliveryOrderLine[];
}

export async function listCouriers(): Promise<CourierOut[]> {
  const { data } = await api.get<CourierOut[]>("/delivery/couriers");
  return data;
}

export async function listCandidates(): Promise<DeliveryPointOut[]> {
  const { data } = await api.get<DeliveryPointOut[]>("/delivery/candidates");
  return data;
}

export async function listAssignments(): Promise<DeliveryAssignmentOut[]> {
  const { data } = await api.get<DeliveryAssignmentOut[]>("/delivery/assignments");
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

export async function listRoutes(params?: {
  courier?: number;
  status?: RouteStatus;
  assigned?: boolean;
}): Promise<DeliveryRouteOut[]> {
  const { data } = await api.get<DeliveryRouteOut[]>("/delivery/routes", { params });
  return data;
}

export async function createRoute(body: {
  courier_employee_id?: number | null;
  name?: string | null;
  note?: string | null;
  customer_address_ids?: number[];
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
  addressIds: number[],
): Promise<DeliveryRouteOut> {
  const { data } = await api.put<DeliveryRouteOut>(`/delivery/routes/${id}/stops`, {
    customer_address_ids: addressIds,
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
