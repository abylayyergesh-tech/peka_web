/** /delivery — конструктор шаблона: слева свободные точки, справа маршруты.
 *
 * Маршрут заводят один раз из точек клиента, хранят постоянно, правят и
 * назначают курьеру во вкладке «Курьеры». Заказы дня в состав не входят. */
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
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Table } from "antd";
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
  type DeliveryPointOut,
  type DeliveryRouteOut,
  type DeliveryStopOut,
  type RouteStatus,
} from "@/api/delivery";
import { addressIdsOfStops, itemsLine } from "@/pages/delivery/points";

const ROUTE_STATUS: Record<RouteStatus, { label: string; color: string }> = {
  planned: { label: "Активен", color: "default" },
  in_progress: { label: "В пути", color: "processing" },
  done: { label: "Завершён", color: "success" },
  cancelled: { label: "Отменён", color: "error" },
};

export default function RoutesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["delivery"] });
    queryClient.invalidateQueries({ queryKey: ["delivery-assignments"] });
    setSelected([]);
  };

  const candidates = useQuery({
    queryKey: ["delivery", "candidates"],
    queryFn: listCandidates,
  });
  const routes = useQuery({
    queryKey: ["delivery", "routes"],
    queryFn: () => listRoutes(),
  });

  const fail = (e: unknown) => message.error(errorMessage(e));
  const points = candidates.data ?? [];

  const create = useMutation({
    mutationFn: (values: { name?: string }) =>
      createRoute({
        name: values.name?.trim() || null,
        customer_address_ids: selected,
      }),
    onSuccess: (route) => {
      message.success(`Маршрут «${route.name ?? "без названия"}» сохранён`);
      setCreating(false);
      form.resetFields();
      invalidate();
    },
    onError: fail,
  });

  const stops = useMutation({
    mutationFn: ({ id, addressIds }: { id: number; addressIds: number[] }) =>
      setRouteStops(id, addressIds),
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
      addressIds: [...addressIdsOfStops(route.stops), ...selected],
    });

  const moveStop = (route: DeliveryRouteOut, index: number, delta: number) => {
    const ids = addressIdsOfStops(route.stops);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    stops.mutate({ id: route.delivery_route_id, addressIds: ids });
  };

  const dropStop = (route: DeliveryRouteOut, addressId: number) =>
    stops.mutate({
      id: route.delivery_route_id,
      addressIds: addressIdsOfStops(route.stops).filter((id) => id !== addressId),
    });

  const columns: ColumnsType<DeliveryPointOut> = [
    {
      title: "Точка",
      dataIndex: "delivery_address",
      render: (v: string, row) => (
        <>
          <div>{row.label ? `${row.label} · ${v}` : v}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.customer_name}
          </Typography.Text>
          {row.entrance_comment && (
            <div style={{ fontSize: 12, color: "#8c8c8c" }}>
              Вход: {row.entrance_comment}
            </div>
          )}
        </>
      ),
    },
  ];

  const openRoutes = (routes.data ?? []).filter((r) => r.status !== "cancelled");

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }} align="center">
        <h2 style={{ margin: 0 }}>Маршруты</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={selected.length === 0}
          onClick={() => setCreating(true)}
        >
          Создать маршрут
        </Button>
        {selected.length > 0 && (
          <Tag color="blue">выбрано точек: {selected.length}</Tag>
        )}
      </Space>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Слева точки клиентов, которые ещё ни на каком маршруте. Отметьте их,
        назовите маршрут — курьера привяжете во вкладке «Курьеры». Шаблон
        хранится постоянно, его можно править.
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
          title="Свободные точки"
          extra={
            <Typography.Text type="secondary">
              {points.length} точ{points.length === 1 ? "ка" : "ек"}
            </Typography.Text>
          }
        >
          <Table<DeliveryPointOut>
            rowKey="customer_address_id"
            size="small"
            loading={candidates.isPending}
            dataSource={points}
            columns={columns}
            pagination={false}
            scroll={{ y: 480 }}
            locale={{ emptyText: "Все точки уже разложены по маршрутам — или точек нет" }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as number[]),
            }}
          />
        </Card>

        <div style={{ flex: "1 1 480px", minWidth: 420 }}>
          {openRoutes.length === 0 && !routes.isPending && (
            <Empty
              description="Маршрутов нет — соберите шаблон из точек слева"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {openRoutes.map((route) => (
              <RouteCard
                key={route.delivery_route_id}
                route={route}
                canAdd={selected.length > 0}
                busy={stops.isPending || patch.isPending}
                onAdd={() => addSelected(route)}
                onMove={(index, delta) => moveStop(route, index, delta)}
                onDrop={(addressId) => dropStop(route, addressId)}
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
  onDrop: (addressId: number) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const status = ROUTE_STATUS[route.status];
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <NodeIndexOutlined />
          <b>{route.name ?? "Без названия"}</b>
          <Tag color={status.color}>{status.label}</Tag>
          <Typography.Text type="secondary">
            точек: {route.stops_total}
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
              description="Точки снова станут свободны для других маршрутов."
              okText="Отменить"
              cancelText="Нет"
              onConfirm={onCancel}
            >
              <Button size="small" icon={<CloseOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm
            title="Удалить маршрут?"
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
      {route.stops.length === 0 ? (
        <Typography.Text type="secondary">
          Пусто — отметьте точки слева и добавьте их сюда.
        </Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={route.stops}
          renderItem={(stop: DeliveryStopOut, index: number) => {
            const aid = stop.customer_address_id;
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
                    disabled={index === route.stops.length - 1 || busy}
                    icon={<ArrowDownOutlined />}
                    onClick={() => onMove(index, 1)}
                  />,
                  <Button
                    key="drop"
                    size="small"
                    type="text"
                    danger
                    disabled={busy || aid == null}
                    icon={<CloseOutlined />}
                    onClick={() => aid != null && onDrop(aid)}
                  />,
                ]}
              >
                <Space direction="vertical" size={0} style={{ flex: 1 }}>
                  <Space size={6} wrap>
                    <b>{index + 1}.</b>
                    <span>
                      {stop.label
                        ? `${stop.label} · ${stop.delivery_address ?? ""}`
                        : (stop.delivery_address ?? "адрес не указан")}
                    </span>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {stop.customer_name ?? "—"}
                    {stop.items.length > 0 ? ` · ${itemsLine(stop.items)}` : ""}
                  </Typography.Text>
                  {stop.entrance_comment && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Вход: {stop.entrance_comment}
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
