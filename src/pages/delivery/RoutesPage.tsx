/** /delivery — рабочее место начальника курьеров: кто что везёт сегодня.
 *
 *  Экран из двух половин, потому что и работа такая: слева заказы, которые надо
 *  развезти и которые ещё никому не отданы, справа рейсы курьеров. Заказ уходит
 *  налево-направо ровно один раз — система не даст положить его в два рейса,
 *  иначе за одним адресом поедут двое, и каждый будет уверен, что он первый.
 *
 *  Порядок объезда задаётся стрелками, а не картой: координат у адресов нет,
 *  оптимизировать нечего, а начальник курьеров город знает лучше алгоритма.
 *
 *  Склада и денег здесь нет: отметки развозки на остатки не влияют, выдачу
 *  проводит касса. */
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CarOutlined,
  CloseOutlined,
  DeleteOutlined,
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
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createRoute,
  deleteRoute,
  listCandidates,
  listCouriers,
  listRoutes,
  setRouteStops,
  updateRoute,
  type DeliveryCandidate,
  type DeliveryRouteOut,
  type DeliveryStopOut,
  type RouteStatus,
} from "@/api/delivery";
import { fmtDateTime, Money } from "@/components/format";

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

/** Состав заказа одной строкой: «Круассан × 2, Багет × 1». */
function itemsLine(items: { name: string; quantity: string }[]): string {
  if (items.length === 0) return "—";
  return items.map((i) => `${i.name} × ${Number(i.quantity)}`).join(", ");
}

export default function RoutesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [day, setDay] = useState<Dayjs>(dayjs());
  const [selected, setSelected] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const date = day.format("YYYY-MM-DD");
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["delivery"] });
    setSelected([]);
  };

  const couriers = useQuery({
    queryKey: ["delivery", "couriers"],
    queryFn: listCouriers,
    staleTime: 60_000,
  });
  const candidates = useQuery({
    queryKey: ["delivery", "candidates", date],
    queryFn: () => listCandidates(date),
  });
  const routes = useQuery({
    queryKey: ["delivery", "routes", date],
    queryFn: () => listRoutes({ date }),
  });

  const fail = (e: unknown) => message.error(errorMessage(e));

  const create = useMutation({
    mutationFn: (values: { courier_employee_id: number; name?: string }) =>
      createRoute({
        route_date: date,
        courier_employee_id: values.courier_employee_id,
        name: values.name || null,
        order_ids: selected,
      }),
    onSuccess: () => {
      message.success("Рейс создан");
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
      message.success("Рейс удалён");
      invalidate();
    },
    onError: fail,
  });

  /** Текущий состав рейса как список заказов — из него и строятся все правки. */
  const orderIdsOf = (route: DeliveryRouteOut) => route.stops.map((s) => s.order_id);

  const addSelected = (route: DeliveryRouteOut) =>
    stops.mutate({ id: route.delivery_route_id,
                   orderIds: [...orderIdsOf(route), ...selected] });

  const move = (route: DeliveryRouteOut, index: number, delta: number) => {
    const ids = orderIdsOf(route);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    stops.mutate({ id: route.delivery_route_id, orderIds: ids });
  };

  const drop = (route: DeliveryRouteOut, orderId: number) =>
    stops.mutate({
      id: route.delivery_route_id,
      orderIds: orderIdsOf(route).filter((id) => id !== orderId),
    });

  const candidateColumns: ColumnsType<DeliveryCandidate> = [
    {
      title: "Заказ",
      dataIndex: "number",
      width: 90,
      render: (v: number | null, row) => (v != null ? `№${v}` : `#${row.order_id}`),
    },
    {
      title: "Куда",
      dataIndex: "delivery_address",
      render: (v: string | null, row) => (
        <>
          <div>{v ?? "адрес не указан"}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.customer_name ?? "—"}
            {row.requested_for ? ` · к ${fmtDateTime(row.requested_for)}` : ""}
          </Typography.Text>
        </>
      ),
    },
    {
      title: "Что везти",
      dataIndex: "items",
      render: (items: DeliveryCandidate["items"]) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {itemsLine(items)}
        </Typography.Text>
      ),
    },
    {
      title: "Сумма",
      dataIndex: "total",
      width: 120,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }} align="center">
        <h2 style={{ margin: 0 }}>Курьеры и маршруты</h2>
        <DatePicker
          value={day}
          onChange={(v) => v && setDay(v)}
          format="DD.MM.YYYY"
          allowClear={false}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreating(true)}
        >
          Новый рейс
        </Button>
        {selected.length > 0 && (
          <Tag color="blue">выбрано заказов: {selected.length}</Tag>
        )}
      </Space>

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
          title="Не разложены"
          extra={
            <Typography.Text type="secondary">
              {candidates.data?.length ?? 0} заказ(ов)
            </Typography.Text>
          }
        >
          <Table<DeliveryCandidate>
            rowKey="order_id"
            size="small"
            loading={candidates.isPending}
            dataSource={candidates.data ?? []}
            columns={candidateColumns}
            pagination={false}
            scroll={{ y: 420 }}
            locale={{ emptyText: "Все заказы этого дня разложены по рейсам" }}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as number[]),
            }}
          />
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
            Выберите заказы и добавьте их в рейс кнопкой в карточке курьера —
            или создайте новый рейс, он заберёт выбранное сразу.
          </Typography.Paragraph>
        </Card>

        <div style={{ flex: "1 1 480px", minWidth: 420 }}>
          {routes.data && routes.data.length === 0 && (
            <Empty
              description="На этот день рейсов нет"
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
                onMove={(index, delta) => move(route, index, delta)}
                onDrop={(orderId) => drop(route, orderId)}
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
        title="Новый рейс"
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="courier_employee_id"
            label="Курьер"
            rules={[{ required: true, message: "Выберите курьера" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={couriers.isPending}
              placeholder="Кто повезёт"
              options={couriers.data?.map((c) => ({
                value: c.employee_id,
                label: [c.full_name, c.position, c.department_name]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
          </Form.Item>
          <Form.Item name="name" label="Название рейса">
            <Input placeholder="Например: Север, второй круг" />
          </Form.Item>
          <Typography.Text type="secondary">
            {selected.length > 0
              ? `Выбранные заказы (${selected.length}) попадут в рейс сразу.`
              : "Заказы можно добавить после создания."}
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
  onDrop: (orderId: number) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const status = ROUTE_STATUS[route.status];
  const done = route.stops_delivered + route.stops_failed;
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <CarOutlined />
          <b>
            {route.courier_name ??
              (route.courier_employee_id == null
                ? "Курьер не назначен"
                : `Сотрудник #${route.courier_employee_id}`)}
          </b>
          {route.name && <Typography.Text type="secondary">{route.name}</Typography.Text>}
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
              title="Отменить рейс?"
              description="Отметки останутся, но рейс будет закрыт."
              okText="Отменить рейс"
              cancelText="Нет"
              onConfirm={onCancel}
            >
              <Button size="small" icon={<CloseOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm
            title="Удалить рейс?"
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
      {route.stops.length === 0 ? (
        <Typography.Text type="secondary">
          Пусто — выберите заказы слева и нажмите «Добавить выбранные».
        </Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={route.stops}
          renderItem={(stop: DeliveryStopOut, index: number) => {
            const marked = stop.status !== "pending";
            const st = STOP_STATUS[stop.status];
            return (
              <List.Item
                key={stop.delivery_stop_id}
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
                  <Tooltip
                    key="drop"
                    title={
                      marked
                        ? "Точка уже отмечена — это история, её не убрать"
                        : "Убрать из рейса"
                    }
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      disabled={marked || busy}
                      icon={<CloseOutlined />}
                      onClick={() => onDrop(stop.order_id)}
                    />
                  </Tooltip>,
                ]}
              >
                <Space direction="vertical" size={0} style={{ flex: 1 }}>
                  <Space size={6} wrap>
                    <b>{stop.position}.</b>
                    <span>{stop.delivery_address ?? "адрес не указан"}</span>
                    <Tag color={st.color}>{st.label}</Tag>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {stop.customer_name ?? "—"}
                    {stop.order_number != null ? ` · заказ №${stop.order_number}` : ""}
                    {" · "}
                    {itemsLine(stop.items)}
                  </Typography.Text>
                  {stop.note && (
                    <Typography.Text type="warning" style={{ fontSize: 12 }}>
                      {stop.note}
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
