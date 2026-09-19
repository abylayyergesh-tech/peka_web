/** /delivery/couriers — раздача готовых шаблонов. Второй этап диспетчера. */
import { CarOutlined, InboxOutlined, NodeIndexOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Card,
  Empty,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  assignCourier,
  listCouriers,
  listRoutes,
  type CourierOut,
  type DeliveryRouteOut,
  type RouteStatus,
} from "@/api/delivery";

const ROUTE_STATUS: Record<RouteStatus, { label: string; color: string }> = {
  planned: { label: "Активен", color: "default" },
  in_progress: { label: "В пути", color: "processing" },
  done: { label: "Завершён", color: "success" },
  cancelled: { label: "Отменён", color: "error" },
};

function courierLabel(c: CourierOut): string {
  return [c.full_name, c.position, c.department_name].filter(Boolean).join(" · ");
}

function routeGist(route: DeliveryRouteOut): string {
  const addresses = route.stops
    .map((s) => (s.label ? `${s.label} · ${s.delivery_address ?? ""}` : s.delivery_address))
    .filter((a): a is string => Boolean(a));
  const unique = addresses.filter((a, i) => addresses.indexOf(a) === i);
  if (unique.length === 0) return "точек нет";
  const head = unique.slice(0, 2).join(" → ");
  return unique.length > 2 ? `${head} → …ещё ${unique.length - 2}` : head;
}

export default function AssignCouriersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const couriers = useQuery({
    queryKey: ["delivery", "couriers"],
    queryFn: listCouriers,
    staleTime: 60_000,
  });
  const routes = useQuery({
    queryKey: ["delivery", "routes"],
    queryFn: () => listRoutes(),
  });

  const assign = useMutation({
    mutationFn: ({ id, courier }: { id: number; courier: number | null }) =>
      assignCourier(id, courier),
    onSuccess: (route) => {
      message.success(
        route.courier_name
          ? `Маршрут отдан: ${route.courier_name}`
          : "Курьер снят — маршрут снова свободен",
      );
      queryClient.invalidateQueries({ queryKey: ["delivery"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-assignments"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const all = (routes.data ?? []).filter((r) => r.status !== "cancelled");
  const free = all.filter((r) => r.courier_employee_id == null);
  const taken = all.filter((r) => r.courier_employee_id != null);

  const options = (couriers.data ?? []).map((c) => ({
    value: c.employee_id,
    label: courierLabel(c),
  }));

  const card = (route: DeliveryRouteOut) => (
    <RouteAssignCard
      key={route.delivery_route_id}
      route={route}
      options={options}
      loading={couriers.isPending}
      busy={assign.isPending}
      onAssign={(courier) => assign.mutate({ id: route.delivery_route_id, courier })}
    />
  );

  return (
    <div>
      <Space wrap style={{ marginBottom: 4 }} align="center">
        <h2 style={{ margin: 0 }}>Курьеры</h2>
      </Space>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Кому какой маршрут. Сами шаблоны собираются во вкладке «Маршруты».
      </Typography.Paragraph>

      {routes.isError && (
        <Alert type="error" showIcon message={errorMessage(routes.error)} />
      )}

      {!routes.isPending && all.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Маршрутов нет — сначала соберите их во вкладке «Маршруты»"
        />
      )}

      {free.length > 0 && (
        <>
          <Space style={{ marginBottom: 8 }}>
            <InboxOutlined />
            <b>Свободные маршруты · {free.length}</b>
          </Space>
          <Space direction="vertical" size={12} style={{ width: "100%", marginBottom: 20 }}>
            {free.map(card)}
          </Space>
        </>
      )}

      {taken.length > 0 && (
        <>
          <Space style={{ marginBottom: 8 }}>
            <CarOutlined />
            <b>Отданы курьерам · {taken.length}</b>
          </Space>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {taken.map(card)}
          </Space>
        </>
      )}

      {all.length > 0 && free.length === 0 && (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 16 }}
          message="Все маршруты разобраны"
        />
      )}
    </div>
  );
}

function RouteAssignCard({
  route,
  options,
  loading,
  busy,
  onAssign,
}: {
  route: DeliveryRouteOut;
  options: { value: number; label: string }[];
  loading: boolean;
  busy: boolean;
  onAssign: (courier: number | null) => void;
}) {
  const status = ROUTE_STATUS[route.status];

  return (
    <Card size="small">
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space wrap size={6}>
          <NodeIndexOutlined />
          <b>{route.name ?? "Без названия"}</b>
          <Tag color={status.color}>{status.label}</Tag>
          <Typography.Text type="secondary">
            точек: {route.stops_total}
          </Typography.Text>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {routeGist(route)}
        </Typography.Text>
        <Select
          style={{ width: "100%", maxWidth: 420 }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Выберите курьера"
          loading={loading}
          disabled={busy || route.status === "cancelled"}
          value={route.courier_employee_id ?? undefined}
          options={options}
          onChange={(v) => onAssign(v ?? null)}
        />
      </Space>
    </Card>
  );
}
