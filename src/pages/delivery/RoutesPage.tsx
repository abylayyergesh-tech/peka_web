/** /delivery — конструктор маршрута: слева адреса заказов на день, справа цепочки.
 *
 * Курьера здесь нет: маршрут собирают вечером на завтра, раздают во вкладке
 * «Курьеры». Точка = адрес, на который есть заказ; основной и доп. едут вместе. */
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  DeleteOutlined,
  NodeIndexOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Table } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createRoute,
  deleteRoute,
  listCandidates,
  listRoutes,
  setRouteStops,
  updateRoute,
  type DeliveryRouteOut,
  type DeliveryStopOut,
  type RouteStatus,
} from "@/api/delivery";
import {
  groupCandidates,
  itemsLine,
  orderIdsOfBlocks,
  stopBlocks,
  type DeliveryPoint,
} from "@/pages/delivery/points";

const ROUTE_STATUS: Record<RouteStatus, { label: string; color: string }> = {
  planned: { label: "Планируется", color: "default" },
  in_progress: { label: "В пути", color: "processing" },
  done: { label: "Завершён", color: "success" },
  cancelled: { label: "Отменён", color: "error" },
};

const STOP_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Ждёт", color: "default" },
  delivered: { label: "Доставлено", color: "success" },
  failed: { label: "Не отдали", color: "error" },
};

export default function RoutesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [day, setDay] = useState<Dayjs>(dayjs().add(1, "day"));
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const date = day.format("YYYY-MM-DD");
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["delivery"] });
    queryClient.invalidateQueries({ queryKey: ["delivery-assignments"] });
    setSelected([]);
  };

  const candidates = useQuery({
    queryKey: ["delivery", "candidates", date],
    queryFn: () => listCandidates(date),
  });
  const routes = useQuery({
    queryKey: ["delivery", "routes", date],
    queryFn: () => listRoutes({ date }),
  });

  const points = groupCandidates(candidates.data ?? []);
  const fail = (e: unknown) => message.error(errorMessage(e));

  const selectedOrderIds = points
    .filter((p) => selected.includes(p.point_key))
    .flatMap((p) => p.order_ids);

  const create = useMutation({
    mutationFn: (values: { name?: string }) =>
      createRoute({
        route_date: date,
        name: values.name?.trim() || null,
        order_ids: selectedOrderIds,
      }),
    onSuccess: (route) => {
      message.success(`Маршрут «${route.name ?? "без названия"}» собран`);
      setCreating(false);
      form.resetFields();
      invalidate();
    },
    onError: fail,
  });

  const stops = useMutation({
    mutationFn: ({ id, orderIds }: { id: number; orderIds: number[] }) =>
      setRouteStops(id, orderIds),
    onSuccess: invalidate,
    onError: fail,
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateRoute>[1] }) =>
      updateRoute(id, body),
    onSuccess: invalidate,
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteRoute(id),
    onSuccess: () => {
      message.success("Маршрут удалён");
      invalidate();
    },
    onError: fail,
  });

  const addSelected = (route: DeliveryRouteOut) =>
    stops.mutate({
      id: route.delivery_route_id,
      orderIds: [...route.stops.map((s) => s.order_id), ...selectedOrderIds],
    });

  const moveBlock = (route: DeliveryRouteOut, index: number, delta: number) => {
    const blocks = stopBlocks(route.stops);
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    stops.mutate({
      id: route.delivery_route_id,
      orderIds: orderIdsOfBlocks(blocks),
    });
  };

  const dropBlock = (route: DeliveryRouteOut, pointKey: string) =>
    stops.mutate({
      id: route.delivery_route_id,
      orderIds: route.stops
        .filter((s) => (s.point_key || `o:${s.order_id}`) !== pointKey)
        .map((s) => s.order_id),
    });

  const columns: ColumnsType<DeliveryPoint> = [
    {
      title: "Адрес",
      dataIndex: "delivery_address",
      render: (v: string | null, row) => (
        <>
          <div>{v ?? "адрес не указан"}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.customer_name ?? "—"}
            {row.orders.length > 1
              ? ` · заказов: ${row.orders.length}`
              : row.orders[0]?.number != null
                ? ` · №${row.orders[0].number}`
                : ""}
            {row.is_extra ? " · доп." : ""}
          </Typography.Text>
          {row.entrance_comment && (
            <div style={{ fontSize: 12, color: "#8c8c8c" }}>
              Вход: {row.entrance_comment}
            </div>
          )}
        </>
      ),
    },
    {
      title: "Что везти",
      render: (_, row) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {itemsLine(row.orders.flatMap((o) => o.items))}
        </Typography.Text>
      ),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }} align="center">
        <h2 style={{ margin: 0 }}>Маршруты</h2>
        <DatePicker
          value={day}
          onChange={(v) => {
            if (!v) return;
            setDay(v);
            setSelected([]);
          }}
          format="DD.MM.YYYY"
          allowClear={false}
        />
        {day.isSame(dayjs().add(1, "day"), "day") && <Tag color="blue">завтра</Tag>}
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={selected.length === 0}
          onClick={() => setCreating(true)}
        >
          Собрать маршрут
        </Button>
        {selected.length > 0 && (
          <Tag color="blue">выбрано точек: {selected.length}</Tag>
        )}
      </Space>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Слева адреса, на которые есть заказ. Отметьте точки, соберите маршрут —
        курьера привяжете во вкладке «Курьеры».
      </Typography.Paragraph>

      {(candidates.isError || routes.isError) && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(candidates.error ?? routes.error)}
        />
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Card
          size="small"
          style={{ flex: "1 1 420px", minWidth: 380 }}
          title="Адреса к доставке"
          extra={
            <Typography.Text type="secondary">
              {points.length} точ{points.length === 1 ? "ка" : "ек"}
            </Typography.Text>
          }
        >
          <Table<DeliveryPoint>
            rowKey="point_key"
            size="small"
            loading={candidates.isPending}
            dataSource={points}
            columns={columns}
            pagination={false}
            scroll={{ y: 480 }}
            locale={{ emptyText: "На этот день все адреса разложены — или заказов нет" }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as string[]),
            }}
          />
        </Card>

        <div style={{ flex: "1 1 480px", minWidth: 420 }}>
          {routes.data && routes.data.length === 0 && (
            <Empty
              description="На этот день маршрутов нет"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {(routes.data ?? []).map((route) => (
              <RouteCard
                key={route.delivery_route_id}
                route={route}
                canAdd={selected.length > 0}
                busy={stops.isPending || patch.isPending}
                onAdd={() => addSelected(route)}
                onMove={(index, delta) => moveBlock(route, index, delta)}
                onDrop={(pointKey) => dropBlock(route, pointKey)}
                onCancel={() =>
                  patch.mutate({
                    id: route.delivery_route_id,
                    body: { status: "cancelled" },
                  })
                }
                onDelete={() => remove.mutate(route.delivery_route_id)}
              />
            ))}
          </Space>
        </div>
      </div>

      <Modal
        open={creating}
        title="Новый маршрут"
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="name"
            label="Название маршрута"
            rules={[{ required: true, message: "Назовите маршрут" }]}
          >
            <Input placeholder="Например: Север, Левый берег" maxLength={128} />
          </Form.Item>
          <Typography.Text type="secondary">
            {selected.length} точ{selected.length === 1 ? "ка" : "ек"} попадут в
            маршрут. Курьера назначите отдельно.
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}

function RouteCard({
  route,
  canAdd,
  busy,
  onAdd,
  onMove,
  onDrop,
  onCancel,
  onDelete,
}: {
  route: DeliveryRouteOut;
  canAdd: boolean;
  busy: boolean;
  onAdd: () => void;
  onMove: (index: number, delta: number) => void;
  onDrop: (pointKey: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const status = ROUTE_STATUS[route.status];
  const done = route.stops_delivered + route.stops_failed;
  const blocks = stopBlocks(route.stops);
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <NodeIndexOutlined />
          <b>{route.name ?? "Без названия"}</b>
          <Tag color={status.color}>{status.label}</Tag>
          <Typography.Text type="secondary">
            {done} из {route.stops_total}
          </Typography.Text>
        </Space>
      }
      extra={
        <Space>
          {canAdd && (
            <Button size="small" type="primary" ghost loading={busy} onClick={onAdd}>
              Добавить выбранные
            </Button>
          )}
          {route.status !== "cancelled" && (
            <Popconfirm
              title="Отменить маршрут?"
              okText="Отменить"
              cancelText="Нет"
              onConfirm={onCancel}
            >
              <Button size="small" icon={<CloseOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm
            title="Удалить маршрут?"
            description="Можно, пока в нём нет отметок."
            okText="Удалить"
            cancelText="Нет"
            onConfirm={onDelete}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      }
    >
      {route.courier_name ? (
        <Tag color="green" style={{ marginBottom: 8 }}>
          Курьер: {route.courier_name}
        </Tag>
      ) : (
        <Tag style={{ marginBottom: 8 }}>Курьер не назначен</Tag>
      )}
      {blocks.length === 0 ? (
        <Typography.Text type="secondary">
          Пусто — отметьте адреса слева и добавьте их сюда.
        </Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={blocks}
          renderItem={(block: DeliveryStopOut[], index: number) => {
            const head = block[0];
            const marked = block.some((s) => s.status !== "pending");
            const key = head.point_key || `o:${head.order_id}`;
            return (
              <List.Item
                actions={[
                  <Button
                    key="up"
                    size="small"
                    type="text"
                    disabled={index === 0 || busy}
                    icon={<ArrowUpOutlined />}
                    onClick={() => onMove(index, -1)}
                  />,
                  <Button
                    key="down"
                    size="small"
                    type="text"
                    disabled={index === blocks.length - 1 || busy}
                    icon={<ArrowDownOutlined />}
                    onClick={() => onMove(index, 1)}
                  />,
                  <Tooltip
                    key="drop"
                    title={marked ? "Точка уже отмечена" : "Убрать из маршрута"}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      disabled={marked || busy}
                      icon={<CloseOutlined />}
                      onClick={() => onDrop(key)}
                    />
                  </Tooltip>,
                ]}
              >
                <Space direction="vertical" size={0} style={{ flex: 1 }}>
                  <Space size={6} wrap>
                    <b>{index + 1}.</b>
                    <span>{head.delivery_address ?? "адрес не указан"}</span>
                    {block.map((s) => {
                      const st = STOP_STATUS[s.status];
                      return s.status !== "pending" ? (
                        <Tag key={s.delivery_stop_id} color={st.color}>
                          {st.label}
                        </Tag>
                      ) : null;
                    })}
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {head.customer_name ?? "—"}
                    {block.map((s) =>
                      s.order_number != null ? ` · №${s.order_number}` : "",
                    ).join("")}
                    {" · "}
                    {itemsLine(block.flatMap((s) => s.items))}
                  </Typography.Text>
                  {head.entrance_comment && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Вход: {head.entrance_comment}
                    </Typography.Text>
                  )}
                </Space>
              </List.Item>
            );
          }}
        />
      )}
    </Card>
  );
}
