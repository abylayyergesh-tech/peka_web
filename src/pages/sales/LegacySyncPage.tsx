/** /legacy-sync — сверка со старым сервисом заказов (cap customer.manage).
 *
 * До перехода клиенты заказывают на старом сайте (app.pekarelli.kz → iiko), а
 * синхронизация раз в минуту повторяет каждый заказ через наш портал от имени
 * того же клиента. Дальше он обычный заказ (касса с меткой «Старый сайт»,
 * сборка, доставка), только без накладной в 1С. Здесь видно главное: что старый
 * сервис принял, а наш отклонил или посчитал иначе — и почему.
 *
 * Вкладки: «По дням» (сводка и причины), «Заказы» (каждый заказ с исходом),
 * «Товары» (сопоставление товаров старого сервиса с нашим меню).
 */
import {
  Alert, App, Button, DatePicker, Descriptions, Drawer, Empty, Select, Space, Switch, Table, Tabs,
  Tag, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getIikoDay, getSyncStatus, getSyncSummary, listSyncOrders, listSyncProducts, retrySyncOrder,
  updateSyncProduct,
  type DaySummaryOut, type IikoKind, type IikoOrderOut, type IikoStatus, type ReasonOut,
  type SyncOrderOut, type SyncOrderStatus, type SyncProductOut,
} from "@/api/legacySync";
import { listAllMenuItems } from "@/api/sales";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, Money } from "@/components/format";
import { usePagination } from "@/components/usePagination";

const STATUS: Record<SyncOrderStatus, { label: string; color: string }> = {
  placed: { label: "Повторён", color: "green" },
  rejected: { label: "Отклонён у нас", color: "red" },
  unmapped: { label: "Не сопоставлен", color: "gold" },
  failed: { label: "Сбой", color: "volcano" },
  pending: { label: "В очереди", color: "blue" },
  cancelled: { label: "Отменён там", color: "default" },
  skipped: { label: "Пропущен", color: "default" },
};

const MATCH: Record<SyncProductOut["match"], { label: string; color: string }> = {
  auto: { label: "автоматически", color: "green" },
  manual: { label: "вручную", color: "blue" },
  ignored: { label: "не повторять", color: "default" },
  none: { label: "не сопоставлен", color: "gold" },
};

const RETRYABLE: SyncOrderStatus[] = ["rejected", "failed", "unmapped"];

/** Отказы портала приходят из API по-английски (их читает и сайт клиента) —
 *  здесь показываем по-русски; незнакомое — как есть. */
const REASONS_RU: Record<string, string> = {
  "Order is below the minimum": "Ниже минимальной суммы заказа точки",
  "Delivery date is outside the bookable window": "Дата доставки вне окна заказа (после отсечки или слишком рано)",
  "Ordering is paused": "Пауза приёма заказов",
  "Position is not in your menu": "Позиции нет в прайс-листе клиента",
  "Position is on stop": "Позиция на стопе",
  "Position is no longer on the menu": "Позиция снята с меню",
  "Unknown menu items": "Неизвестная позиция меню",
  "Delivery address is no longer available": "Точка доставки закрыта",
  "Delivery is currently unavailable": "Доставка выключена в правилах заказа",
  "Duplicate delivery point in the cart": "Одна точка дважды в корзине",
  "Unknown account": "Логин клиента выключен",
};

function reasonRu(message: string | null): string | null {
  if (!message) return null;
  if (REASONS_RU[message]) return REASONS_RU[message];
  if (/^Menu item \d+ not found$/.test(message)) return "Позиция меню не найдена";
  return message;
}

function StatusTag({ status }: { status: SyncOrderStatus }) {
  const s = STATUS[status];
  return <Tag color={s.color}>{s.label}</Tag>;
}

function diffOf(row: SyncOrderOut): number | null {
  if (row.status !== "placed" || row.our_total == null || row.external_total == null) return null;
  return Number(row.our_total) - Number(row.external_total);
}

// ------------------------------------------------------------------ состояние
function SyncHealth() {
  const status = useQuery({ queryKey: ["legacy-sync", "status"], queryFn: getSyncStatus,
                            refetchInterval: 60_000 });
  const s = status.data;
  if (!s) return null;
  if (!s.enabled) {
    return <Alert type="info" showIcon style={{ marginBottom: 16 }}
                  message="Синхронизация выключена — новые заказы старого сервиса не приходят." />;
  }
  const lastOk = s.last_ok_at ? dayjs(s.last_ok_at) : null;
  const stale = !lastOk || dayjs().diff(lastOk, "minute") > 10;
  if (s.failed_in_row > 0 || stale) {
    return (
      <Alert type={stale ? "error" : "warning"} showIcon style={{ marginBottom: 16 }}
             message={lastOk
               ? `Нет связи со старым сервисом с ${fmtDateTime(s.last_ok_at)} (сбоев подряд: ${s.failed_in_row})`
               : "Синхронизация ещё ни разу не прошла успешно"}
             description={s.last_run?.error ?? undefined} />
    );
  }
  return (
    <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
      Синхронизация работает: последний проход {fmtDateTime(s.last_run?.started_at)}.
    </Typography.Paragraph>
  );
}

// ------------------------------------------------------------------ по дням
function DaysTab({ onPick }: { onPick: (f: { day?: string; status?: SyncOrderStatus;
                                               mismatch?: boolean }) => void }) {
  const summary = useQuery({ queryKey: ["legacy-sync", "summary"], queryFn: () => getSyncSummary() });
  const columns: ColumnsType<DaySummaryOut> = [
    { title: "День (оформлен там)", dataIndex: "day", render: (v: string) => fmtDate(v) },
    { title: "Заказов", dataIndex: "total", align: "right" },
    { title: "Повторено", dataIndex: "placed", align: "right",
      render: (v: number, r) => <a onClick={() => onPick({ day: r.day, status: "placed" })}>{v}</a> },
    { title: "Отклонено у нас", dataIndex: "rejected", align: "right",
      render: (v: number, r) => v
        ? <a style={{ color: "#cf1322" }} onClick={() => onPick({ day: r.day, status: "rejected" })}>{v}</a>
        : 0 },
    { title: "Не сопоставлено", dataIndex: "unmapped", align: "right",
      render: (v: number, r) => v
        ? <a onClick={() => onPick({ day: r.day, status: "unmapped" })}>{v}</a> : 0 },
    { title: "Сбой / в очереди", key: "wait", align: "right",
      render: (_, r) => `${r.failed} / ${r.pending}` },
    { title: "Сумма там", dataIndex: "external_sum", align: "right",
      render: (v: string) => <Money value={v} /> },
    { title: "Сумма у нас", dataIndex: "our_sum", align: "right",
      render: (v: string) => <Money value={v} />,
      // Наша сумма — только по повторённым, поэтому сравнивать её с «там» в лоб нельзя.
    },
    { title: "Другая сумма", key: "mismatch", align: "right",
      render: (_, r) => r.mismatched
        ? <a onClick={() => onPick({ day: r.day, mismatch: true })}>
            {r.mismatched} ({Number(r.diff_sum) > 0 ? "+" : ""}{fmtMoney(r.diff_sum)})
          </a>
        : 0 },
  ];
  const reasonColumns: ColumnsType<ReasonOut> = [
    { title: "Исход", dataIndex: "status", width: 170, render: (v: SyncOrderStatus) => <StatusTag status={v} /> },
    { title: "Причина", dataIndex: "error_message",
      render: (v: string | null, r) => <span>{reasonRu(v) ?? "—"} <Typography.Text type="secondary">{r.error_code}</Typography.Text></span> },
    { title: "Заказов", dataIndex: "count", width: 100, align: "right",
      render: (v: number, r) => <a onClick={() => onPick({ status: r.status })}>{v}</a> },
  ];
  return (
    <>
      <Table rowKey="day" size="small" loading={summary.isPending} pagination={false}
             dataSource={summary.data?.days} columns={columns} scroll={{ x: "max-content" }}
             locale={{ emptyText: <Empty description="Заказов из старого сервиса пока нет" /> }} />
      <h3 style={{ marginTop: 24 }}>Почему не повторено (за 14 дней)</h3>
      <Table rowKey={(r) => `${r.status}:${r.error_code}:${r.error_message}`} size="small"
             pagination={false} dataSource={summary.data?.reasons} columns={reasonColumns}
             locale={{ emptyText: "Отказов нет" }} />
    </>
  );
}

// ------------------------------------------------------------------ заказы
function OrdersTab({ filter, setFilter }: {
  filter: { day?: string; status?: SyncOrderStatus; mismatch?: boolean };
  setFilter: (f: { day?: string; status?: SyncOrderStatus; mismatch?: boolean }) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const { limit, offset, tablePagination, reset } = usePagination(50);
  const [open, setOpen] = useState<SyncOrderOut | null>(null);

  const query = useQuery({
    queryKey: ["legacy-sync", "orders", filter, { limit, offset }],
    queryFn: () => listSyncOrders({ ...filter, limit, offset }),
  });
  const retry = useMutation({
    mutationFn: (id: number) => retrySyncOrder(id),
    onSuccess: (row) => {
      message.success("Повторим на ближайшем проходе синхронизации (до минуты)");
      setOpen(row);
      queryClient.invalidateQueries({ queryKey: ["legacy-sync"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const update = (f: typeof filter) => { reset(); setFilter(f); };
  const columns: ColumnsType<SyncOrderOut> = [
    { title: "Оформлен там", dataIndex: "external_created_at", width: 150,
      render: (v: string) => fmtDateTime(v) },
    { title: "Клиент", dataIndex: "customer_name", render: (v: string | null) => v ?? "—" },
    { title: "Точка", dataIndex: "address_label", render: (v: string | null) => v ?? "—" },
    { title: "На дату", dataIndex: "delivery_date", width: 110,
      render: (v: string | null) => (v ? fmtDate(v) : "—") },
    { title: "Сумма там", dataIndex: "external_total", align: "right",
      render: (v: string | null) => <Money value={v} /> },
    { title: "Сумма у нас", dataIndex: "our_total", align: "right",
      render: (v: string | null, r) => {
        const d = diffOf(r);
        return v == null ? "—" : (
          <span style={d != null && Math.abs(d) > 1 ? { color: "#d46b08", fontWeight: 600 } : undefined}>
            <Money value={v} />
          </span>
        );
      } },
    { title: "Исход", dataIndex: "status", width: 150, render: (v: SyncOrderStatus) => <StatusTag status={v} /> },
    { title: "Причина", dataIndex: "error_message", render: (v: string | null) => reasonRu(v) ?? "" },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select allowClear placeholder="Исход" style={{ width: 200 }} value={filter.status}
                onChange={(v) => update({ ...filter, status: v })}
                options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <DatePicker placeholder="День (оформлен там)" format="DD.MM.YYYY"
                    value={filter.day ? dayjs(filter.day) : null}
                    onChange={(d) => update({ ...filter, day: d ? d.format("YYYY-MM-DD") : undefined })} />
        <Space>
          <Switch checked={!!filter.mismatch}
                  onChange={(v) => update({ ...filter, mismatch: v || undefined })} />
          Только с другой суммой
        </Space>
      </Space>
      <Table rowKey="legacy_sync_order_id" size="small" loading={query.isPending}
             dataSource={query.data?.items} columns={columns}
             pagination={tablePagination(query.data?.total)} scroll={{ x: "max-content" }}
             rowClassName={() => "row-clickable"} onRow={(row) => ({ onClick: () => setOpen(row) })} />
      <Drawer open={open != null} onClose={() => setOpen(null)} width={640}
              title={open ? `Заказ ${open.external_id}` : ""}
              extra={open && canManage && RETRYABLE.includes(open.status) && (
                <Button type="primary" loading={retry.isPending}
                        onClick={() => retry.mutate(open.legacy_sync_order_id)}>Повторить</Button>
              )}>
        {open && <OrderDetail row={open} />}
      </Drawer>
    </>
  );
}

function OrderDetail({ row }: { row: SyncOrderOut }) {
  const d = diffOf(row);
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Исход"><StatusTag status={row.status} /></Descriptions.Item>
        {row.error_message && (
          <Descriptions.Item label="Причина">
            {reasonRu(row.error_message)} <Typography.Text type="secondary">{row.error_code}</Typography.Text>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Клиент / точка">
          {row.customer_name ?? "—"} · {row.address_label ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Оформлен там">{fmtDateTime(row.external_created_at)}</Descriptions.Item>
        {row.resent_from && (
          <Descriptions.Item label="Переотправка">
            Правила проверены на время исходной попытки {fmtDateTime(row.placed_at)}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="На дату">{row.delivery_date ? fmtDate(row.delivery_date) : "—"}</Descriptions.Item>
        <Descriptions.Item label="Статус там">{row.external_status ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Сумма там / у нас">
          <Money value={row.external_total} /> / {row.our_total == null ? "—" : <Money value={row.our_total} />}
          {d != null && Math.abs(d) > 1 && (
            <Tag color="orange" style={{ marginLeft: 8 }}>{d > 0 ? "+" : ""}{fmtMoney(d)}</Tag>
          )}
        </Descriptions.Item>
        {row.order_id != null && (
          <Descriptions.Item label="Копия у нас">заказ №{row.order_number ?? row.order_id}</Descriptions.Item>
        )}
        <Descriptions.Item label="Попыток">{row.attempts}</Descriptions.Item>
      </Descriptions>
      <Table rowKey={(_, i) => String(i)} size="small" pagination={false}
             dataSource={row.external_lines ?? []}
             columns={[
               { title: "Товар (там)", dataIndex: "name" },
               { title: "Кол-во", dataIndex: "quantity", align: "right", render: (v: string) => fmtQty(v) },
               { title: "Цена там", dataIndex: "price_per_unit", align: "right",
                 render: (v: string) => <Money value={v} /> },
               { title: "Сумма", dataIndex: "price", align: "right", render: (v: string) => <Money value={v} /> },
             ]} />
      {row.error_details && (
        <pre style={{ background: "#fafafa", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(row.error_details, null, 2)}
        </pre>
      )}
    </Space>
  );
}

// ------------------------------------------------------------------ iiko
const IIKO_KIND: Record<IikoKind, string> = {
  site: "С сайта",
  direct: "Заведён в iiko",
  staff_meal: "Питание сотрудников",
  unpaid: "Без оплаты",
};
const IIKO_STATUS: Record<IikoStatus, { label: string; color: string }> = {
  matched: { label: "Совпадает", color: "green" },
  applied: { label: "Правки перенесены", color: "blue" },
  imported: { label: "Заведён у нас", color: "blue" },
  unmatched: { label: "Копия не найдена", color: "gold" },
  skipped: { label: "Не переносим", color: "default" },
  failed: { label: "Ошибка", color: "red" },
};

function IikoTab() {
  const [day, setDay] = useState<string | undefined>(undefined);
  const query = useQuery({ queryKey: ["legacy-sync", "iiko", day], queryFn: () => getIikoDay(day) });
  const [open, setOpen] = useState<IikoOrderOut | null>(null);
  const columns: ColumnsType<IikoOrderOut> = [
    { title: "№ в iiko", dataIndex: "order_num", width: 90 },
    { title: "Откуда", dataIndex: "kind", width: 170, render: (v: IikoKind) => IIKO_KIND[v] },
    { title: "Точка / контрагент", key: "who",
      render: (_, r) => r.external_number || r.counteragent || r.pay_type || "—" },
    { title: "Шт.", dataIndex: "quantity", align: "right", width: 80, render: (v: string) => fmtQty(v) },
    { title: "Сумма", dataIndex: "total", align: "right", render: (v: string) => <Money value={v} /> },
    { title: "Итог", dataIndex: "status", width: 170,
      render: (v: IikoStatus) => <Tag color={IIKO_STATUS[v].color}>{IIKO_STATUS[v].label}</Tag> },
    { title: "Примечание", dataIndex: "note", render: (v: string | null) => v ?? "" },
  ];
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker placeholder="День (сегодня)" format="DD.MM.YYYY" value={day ? dayjs(day) : null}
                    onChange={(d) => setDay(d ? d.format("YYYY-MM-DD") : undefined)} />
        <Typography.Text type="secondary">
          Правки заказов сайта в iiko (замены, убранные позиции) переносятся в копию до автоприёма;
          заказы, заведённые в iiko на контрагента, заводятся у нас.
        </Typography.Text>
      </Space>
      <Table rowKey={(r) => `${r.kind}:${r.status}`} size="small" pagination={false}
             loading={query.isPending} dataSource={query.data?.summary} style={{ marginBottom: 16 }}
             locale={{ emptyText: "За этот день заказов iiko нет" }}
             columns={[
               { title: "Откуда", dataIndex: "kind", render: (v: IikoKind) => IIKO_KIND[v] },
               { title: "Итог", dataIndex: "status",
                 render: (v: IikoStatus) => <Tag color={IIKO_STATUS[v].color}>{IIKO_STATUS[v].label}</Tag> },
               { title: "Заказов", dataIndex: "orders", align: "right" },
               { title: "Шт.", dataIndex: "quantity", align: "right", render: (v: string) => fmtQty(v) },
               { title: "Сумма", dataIndex: "total", align: "right", render: (v: string) => <Money value={v} /> },
             ]} />
      <Table rowKey="legacy_sync_iiko_order_id" size="small" loading={query.isPending}
             dataSource={query.data?.orders} columns={columns} scroll={{ x: "max-content" }}
             pagination={{ pageSize: 50 }}
             rowClassName={() => "row-clickable"} onRow={(row) => ({ onClick: () => setOpen(row) })} />
      <Drawer open={open != null} onClose={() => setOpen(null)} width={560}
              title={open ? `Заказ iiko №${open.order_num ?? ""}` : ""}>
        {open && (
          <Table rowKey={(_, i) => String(i)} size="small" pagination={false} dataSource={open.lines ?? []}
                 columns={[
                   { title: "Блюдо", dataIndex: "name" },
                   { title: "Шт.", dataIndex: "quantity", align: "right", render: (v: string) => fmtQty(v) },
                   { title: "Сумма", dataIndex: "amount_net", align: "right",
                     render: (v: string) => <Money value={v} /> },
                 ]} />
        )}
      </Drawer>
    </>
  );
}

// ------------------------------------------------------------------ товары
function ProductsTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const products = useQuery({
    queryKey: ["legacy-sync", "products", onlyOpen],
    queryFn: () => listSyncProducts(onlyOpen ? "none" : undefined),
  });
  const menuItems = useQuery({
    queryKey: ["menu-items", "for-legacy-sync"],
    queryFn: () => listAllMenuItems({ active: true }),
    staleTime: 60_000,
  });
  const options = useMemo(() => (menuItems.data ?? []).map((m) => ({ value: m.menu_item_id, label: m.name })),
                          [menuItems.data]);
  const save = useMutation({
    mutationFn: (v: { id: number; menu_item_id: number | null; ignored: boolean }) =>
      updateSyncProduct(v.id, { menu_item_id: v.menu_item_id, ignored: v.ignored }),
    onSuccess: () => {
      message.success("Сохранено — заказы с этим товаром повторятся на ближайшем проходе");
      queryClient.invalidateQueries({ queryKey: ["legacy-sync"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<SyncProductOut> = [
    { title: "Товар в старом сервисе", dataIndex: "name" },
    { title: "Строк в заказах", dataIndex: "seen_count", width: 140, align: "right" },
    { title: "Позиция нашего меню", key: "item", width: 320,
      render: (_, r) => (
        <Select showSearch allowClear optionFilterProp="label" style={{ width: "100%" }}
                placeholder="Выберите позицию" disabled={!canManage} options={options}
                value={r.menu_item_id ?? undefined}
                onChange={(v) => save.mutate({ id: r.legacy_sync_product_id,
                                               menu_item_id: v ?? null, ignored: false })} />
      ) },
    { title: "Как сопоставлен", dataIndex: "match", width: 150,
      render: (v: SyncProductOut["match"]) => <Tag color={MATCH[v].color}>{MATCH[v].label}</Tag> },
    { title: "", key: "actions", width: 150,
      render: (_, r) => canManage && r.match !== "ignored" && (
        <a onClick={() => save.mutate({ id: r.legacy_sync_product_id, menu_item_id: null, ignored: true })}>
          Не повторять
        </a>
      ) },
  ];
  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Switch checked={onlyOpen} onChange={setOnlyOpen} /> Только несопоставленные
      </Space>
      <Table rowKey="legacy_sync_product_id" size="small" loading={products.isPending}
             dataSource={products.data} columns={columns} pagination={false}
             scroll={{ x: "max-content" }}
             locale={{ emptyText: onlyOpen ? "Все товары сопоставлены" : "Товаров пока нет" }} />
    </>
  );
}

export default function LegacySyncPage() {
  const [tab, setTab] = useState("days");
  const [filter, setFilter] = useState<{ day?: string; status?: SyncOrderStatus; mismatch?: boolean }>({});
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Сверка со старым сервисом</h2>
      <Typography.Paragraph type="secondary">
        Заказы со старого сайта (app.pekarelli.kz) повторяются у нас через сайт клиента и
        попадают оператору в кассу с меткой «Старый сайт», в сборку и доставку — как
        обычные. Накладную в 1С они не создают.
      </Typography.Paragraph>
      <SyncHealth />
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: "days", label: "По дням",
          children: <DaysTab onPick={(f) => { setFilter(f); setTab("orders"); }} /> },
        { key: "orders", label: "Заказы", children: <OrdersTab filter={filter} setFilter={setFilter} /> },
        { key: "products", label: "Товары", children: <ProductsTab /> },
        { key: "iiko", label: "iiko", children: <IikoTab /> },
      ]} />
    </div>
  );
}
