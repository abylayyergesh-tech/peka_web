/** /inventory-count/:id — лист пересчёта открытой сессии.
 *
 *  Экран устроен как настоящий лист обхода: слева то, что система считает лежащим
 *  на полке, справа поле «по факту». Введённое СОХРАНЯЕТСЯ НА СЕРВЕР — в этом и
 *  весь смысл сессии: обход идёт часами, его ведут с нескольких телефонов, и
 *  закрытая вкладка больше ничего не стирает.
 *
 *  Сохранение отложенное (одна пачка на секунду простоя) и обязательное при
 *  уходе из поля: по одному запросу на каждую полку — это пятьдесят поводов для
 *  «сохранение не удалось» на складской сети.
 *
 *  Пустое поле значит «не считали» — остаток по такой строке не меняется. Ноль —
 *  это результат: полка пуста, и остаток станет нулевым. Разница между этими
 *  двумя состояниями — главное, что должно быть видно на экране, поэтому пустая
 *  строка помечена серым «не считали», а не нулём.
 *
 *  Расхождение и его деньги считает СЕРВЕР и присылает в строке: иначе телефон,
 *  админка и проводка расходились бы в арифметике на копейки, а спорить с
 *  проводкой бессмысленно — она и есть учёт. */
import {
  CheckCircleOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
} from "@ant-design/icons";
import {
  Alert, App, Button, Card, Checkbox, Col, Descriptions, Input, InputNumber, Modal,
  Popconfirm, Row, Segmented, Select, Space, Statistic, Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  cancelCountSession,
  closeCountSession,
  deleteCountLine,
  getCountSession,
  saveCountLines,
  type SessionLineIn,
  type SessionLineOut,
} from "@/api/counting";
import { useCan } from "@/auth/store";
import { Money, fmtDate, fmtQty } from "@/components/format";
import { RowStatusTag, SessionStatusTag, signed } from "@/pages/inventory/countShared";
import { useProductsLookup } from "@/pages/inventory/shared";

type Filter = "all" | "todo" | "diff";

const keyOf = (line: { warehouse_id: number; product_id: number }) =>
  `${line.warehouse_id}-${line.product_id}`;

export default function CountSessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCount = useCan("inventory.count");
  const products = useProductsLookup();

  const [warehouseId, setWarehouseId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [closeOpen, setCloseOpen] = useState(false);
  const [allowUncounted, setAllowUncounted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addProduct, setAddProduct] = useState<number | undefined>();
  const [addWarehouse, setAddWarehouse] = useState<number | undefined>();

  const query = useQuery({
    queryKey: ["count-session", sessionId],
    queryFn: () => getCountSession(sessionId),
    enabled: Number.isFinite(sessionId),
  });
  const session = query.data?.session;
  const lines = query.data?.lines ?? [];
  const isOpen = session?.status === "open";
  const editable = isOpen && canCount;

  /** Правки, ещё не улетевшие на сервер. Ключ — «склад-товар».
   *
   *  Держим в ref, а не только в состоянии: таймер отправки не должен зависеть от
   *  того, успел ли перерисоваться компонент, иначе последняя набранная цифра
   *  уезжает в следующую пачку — то есть иногда никуда. */
  const pending = useRef<Map<string, SessionLineIn>>(new Map());
  const [dirty, setDirty] = useState(0);
  const timer = useRef<number | null>(null);

  const save = useMutation({
    mutationFn: (batch: SessionLineIn[]) => saveCountLines(sessionId, batch),
    onSuccess: (fresh) => {
      // Сервер возвращает ТОЛЬКО сохранённые строки, уже с пересчитанным
      // расхождением — вливаем их в лист по ключу «склад-товар». Тянуть весь лист
      // (шестьсот позиций) после каждой цифры незачем; новая строка, которой в
      // листе не было, добавляется в конец.
      queryClient.setQueryData(
        ["count-session", sessionId],
        (prev: { session: unknown; lines: SessionLineOut[] } | undefined) => {
          if (!prev) return prev;
          const byKey = new Map(fresh.map((line) => [keyOf(line), line]));
          const merged = prev.lines.map((line) => byKey.get(keyOf(line)) ?? line);
          const known = new Set(prev.lines.map(keyOf));
          const added = fresh.filter((line) => !known.has(keyOf(line)));
          return { ...prev, lines: [...merged, ...added] };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["count-sessions"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function flush() {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const batch = [...pending.current.values()];
    if (batch.length === 0) return;
    pending.current.clear();
    setDirty(0);
    save.mutate(batch);
  }

  function queueChange(line: SessionLineOut, patch: Partial<SessionLineIn>) {
    const key = keyOf(line);
    const prev = pending.current.get(key);
    pending.current.set(key, {
      warehouse_id: line.warehouse_id,
      product_id: line.product_id,
      // Значения полей берём из уже накопленной правки, иначе цена стёрла бы
      // только что введённый факт (и наоборот).
      counted_quantity: prev?.counted_quantity ?? line.counted_quantity,
      unit_id: line.unit_id,
      price: prev?.price ?? line.price,
      note: prev?.note ?? line.note,
      ...patch,
    });
    setDirty(pending.current.size);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 1000);
  }

  // Уходя со страницы — дописать. Иначе последняя правка теряется ровно в тот
  // момент, когда человек считает, что закончил.
  useEffect(() => {
    return () => {
      const batch = [...pending.current.values()];
      if (batch.length) saveCountLines(sessionId, batch).catch(() => undefined);
    };
  }, [sessionId]);

  const close = useMutation({
    mutationFn: () =>
      closeCountSession(sessionId, { allow_uncounted: allowUncounted }),
    onSuccess: (result) => {
      setCloseOpen(false);
      queryClient.invalidateQueries({ queryKey: ["count-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["count-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      message.success(
        result.posted_lines === 0
          ? "Сессия закрыта: расхождений не было, проводить нечего"
          : `Проведено строк: ${result.posted_lines} в ${result.document_ids.length} документах`,
      );
      navigate(`/inventory-count/${sessionId}/report`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: () => cancelCountSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["count-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["count-sessions"] });
      message.success("Сессия отменена: остатки не тронуты");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const removeLine = useMutation({
    mutationFn: (lineId: number) => deleteCountLine(sessionId, lineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["count-session", sessionId] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const addLine = useMutation({
    mutationFn: () => {
      const product = products.byId.get(addProduct as number);
      if (!product || addWarehouse == null) {
        throw new Error("Выберите склад и товар");
      }
      return saveCountLines(sessionId, [{
        warehouse_id: addWarehouse,
        product_id: addProduct as number,
        // Строку добавляем пустой: её ещё надо посчитать.
        counted_quantity: null,
        unit_id: product.base_unit_id,
      }]);
    },
    onSuccess: () => {
      setAddOpen(false);
      setAddProduct(undefined);
      queryClient.invalidateQueries({ queryKey: ["count-session", sessionId] });
      message.success("Позиция добавлена в лист");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (warehouseId !== "all" && line.warehouse_id !== warehouseId) return false;
      if (filter === "todo" && line.counted_quantity != null) return false;
      if (filter === "diff" && line.status !== "shortage" && line.status !== "surplus") {
        return false;
      }
      if (!q) return true;
      return (
        line.product_name.toLowerCase().includes(q) ||
        (line.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [lines, warehouseId, filter, search]);

  const stats = useMemo(() => {
    let counted = 0;
    let diffs = 0;
    let missingPrice = 0;
    let value = 0;
    for (const line of lines) {
      if (line.counted_quantity != null) counted += 1;
      if (line.status === "shortage" || line.status === "surplus") {
        diffs += 1;
        value += Number(line.diff_value ?? 0);
      }
      if (line.needs_price) missingPrice += 1;
    }
    return { counted, diffs, missingPrice, value, total: lines.length };
  }, [lines]);

  const uncounted = stats.total - stats.counted;

  const columns: ColumnsType<SessionLineOut> = [
    ...(warehouseId === "all"
      ? [{
          title: "Склад",
          dataIndex: "warehouse_id",
          width: 170,
          render: (_: number, row: SessionLineOut) =>
            session?.warehouses.find((w) => w.warehouse_id === row.warehouse_id)
              ?.warehouse_name ?? `#${row.warehouse_id}`,
        } as ColumnsType<SessionLineOut>[number]]
      : []),
    {
      title: "Продукт",
      dataIndex: "product_name",
      render: (v: string, row) => (
        <Space size={4} direction="vertical" style={{ display: "flex" }}>
          <span>{v}</span>
          {row.sku && <span style={{ color: "#999", fontSize: 12 }}>{row.sku}</span>}
        </Space>
      ),
      sorter: (a, b) => a.product_name.localeCompare(b.product_name),
    },
    {
      title: "По учёту",
      dataIndex: "current_quantity",
      width: 130,
      align: "right",
      render: (v: string, row) => (
        <Space size={4}>
          <span>{fmtQty(v)}</span>
          <span style={{ color: "#999", fontSize: 12 }}>{row.unit_name}</span>
        </Space>
      ),
    },
    {
      title: "По факту",
      key: "fact",
      width: 150,
      render: (_, row) => (
        <InputNumber
          min={0}
          style={{ width: "100%" }}
          disabled={!editable}
          value={row.counted_quantity == null ? undefined : Number(row.counted_quantity)}
          placeholder="не считали"
          onChange={(v) =>
            queueChange(row, { counted_quantity: v == null ? null : String(v) })
          }
          onBlur={flush}
          onPressEnter={flush}
        />
      ),
    },
    {
      // Цена нужна только там, где излишек не оценить по средней: у товара нет
      // ни количества, ни стоимости. В остальных строках колонка пустая.
      title: "Цена за ед.",
      key: "price",
      width: 140,
      render: (_, row) => {
        const wanted = row.needs_price || row.price != null;
        if (!wanted) return <span style={{ color: "#bbb" }}>—</span>;
        return (
          <Tooltip title="У товара нет средней себестоимости — излишек надо оценить, иначе стоимость возникнет из ничего">
            <InputNumber
              min={0}
              step={0.01}
              style={{ width: "100%" }}
              status={row.needs_price ? "warning" : undefined}
              disabled={!editable}
              value={row.price == null ? undefined : Number(row.price)}
              placeholder="нужна цена"
              onChange={(v) => queueChange(row, { price: v == null ? null : String(v) })}
              onBlur={flush}
              onPressEnter={flush}
            />
          </Tooltip>
        );
      },
    },
    {
      title: "Разница",
      key: "diff",
      width: 170,
      align: "right",
      render: (_, row) => {
        if (row.counted_quantity == null) {
          return <RowStatusTag status="uncounted" />;
        }
        if (row.status === "match") return <RowStatusTag status="match" />;
        const s = signed(row.diff);
        return (
          <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
            <b style={{ color: s.color }}>{s.text}</b>
            <span style={{ color: "#999", fontSize: 12 }}>
              <Money value={row.diff_value ?? "0"} />
            </span>
          </Space>
        );
      },
    },
    {
      title: "Кто считал",
      dataIndex: "counted_by_name",
      width: 160,
      render: (v: string | null, row) =>
        v ? (
          <Tooltip title={row.counted_at ? fmtDate(row.counted_at) : undefined}>
            <span>{v}</span>
          </Tooltip>
        ) : (
          <span style={{ color: "#bbb" }}>—</span>
        ),
    },
    ...(editable
      ? [{
          title: "",
          width: 90,
          render: (_: unknown, row: SessionLineOut) => (
            <Popconfirm
              title="Убрать позицию из листа?"
              description="Только из листа — товар и остаток не затрагиваются."
              okText="Да"
              cancelText="Нет"
              onConfirm={() => removeLine.mutate(row.inventory_count_session_line_id)}
            >
              <a>Убрать</a>
            </Popconfirm>
          ),
        } as ColumnsType<SessionLineOut>[number]]
      : []),
  ];

  if (query.isError) {
    return <Alert type="error" showIcon message={errorMessage(query.error)} />;
  }

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <Space align="center">
          <h2 style={{ margin: 0 }}>{session?.name ?? "Инвентаризация"}</h2>
          {session && <SessionStatusTag status={session.status} />}
        </Space>
        <Space>
          <Button onClick={() => navigate("/inventory-count")}>К списку</Button>
          <Button onClick={() => navigate(`/inventory-count/${sessionId}/report`)}>
            Отчёт
          </Button>
          {editable && (
            <>
              <Popconfirm
                title="Отменить сессию?"
                description="Остатки не изменятся, лист останется историей."
                okText="Отменить сессию"
                cancelText="Нет"
                onConfirm={() => cancel.mutate()}
              >
                <Button danger>Отменить</Button>
              </Popconfirm>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  flush();
                  setAllowUncounted(false);
                  setCloseOpen(true);
                }}
              >
                Закрыть с проводкой
              </Button>
            </>
          )}
        </Space>
      </Space>

      {session && (
        <Descriptions
          size="small"
          bordered
          column={{ xs: 1, sm: 2, md: 4 }}
          style={{ marginBottom: 16 }}
          items={[
            { key: "date", label: "Дата пересчёта", children: fmtDate(session.count_date) },
            {
              key: "wh",
              label: "Склады",
              children: session.warehouses.map((w) => w.warehouse_name).join(", ") || "—",
            },
            { key: "who", label: "Открыл", children: session.opened_by_name ?? "—" },
            {
              key: "closed",
              label: "Закрыта",
              children: session.closed_at
                ? `${fmtDate(session.closed_at)}${session.closed_by_name ? `, ${session.closed_by_name}` : ""}`
                : "—",
            },
          ]}
        />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Посчитано"
              value={`${stats.counted} / ${stats.total}`}
              valueStyle={
                stats.total > 0 && stats.counted === stats.total
                  ? { color: "#389e0d" }
                  : undefined
              }
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Нестыковок"
              value={stats.diffs}
              valueStyle={stats.diffs ? { color: "#cf1322" } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Итог по деньгам"
              formatter={() => <Money value={String(stats.value)} />}
              value={stats.value}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Не сохранено"
              value={dirty}
              valueStyle={dirty ? { color: "#d46b08" } : { color: "#389e0d" }}
              suffix={
                save.isPending ? (
                  <span style={{ fontSize: 13, color: "#999" }}>сохраняю…</span>
                ) : dirty ? (
                  <Button size="small" type="link" onClick={flush}>
                    сохранить
                  </Button>
                ) : null
              }
            />
          </Card>
        </Col>
      </Row>

      {!canCount && isOpen && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Только просмотр"
          description="Вносить факт и закрывать сессию может администрация — нужно право inventory.count."
        />
      )}

      {stats.missingPrice > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Без цены нельзя закрыть: ${stats.missingPrice} поз.`}
          description="У этих товаров нет средней себестоимости, поэтому найденный на полке излишек надо оценить вручную — заполните «Цена за ед.»."
        />
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Select<number | "all">
          style={{ width: 240 }}
          value={warehouseId}
          onChange={setWarehouseId}
          options={[
            { value: "all" as const, label: "Все склады сессии" },
            ...(session?.warehouses ?? []).map((w) => ({
              value: w.warehouse_id,
              label: `${w.warehouse_name} (${w.counted}/${w.lines_total})`,
            })),
          ]}
        />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Все" },
            { value: "todo", label: `Не посчитано (${uncounted})` },
            { value: "diff", label: `Нестыковки (${stats.diffs})` },
          ]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Поиск по названию или артикулу"
          style={{ width: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>
          Обновить
        </Button>
        {editable && (
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setAddWarehouse(
                warehouseId === "all"
                  ? session?.warehouses[0]?.warehouse_id
                  : warehouseId,
              );
              setAddOpen(true);
            }}
          >
            Добавить позицию
          </Button>
        )}
      </Space>

      <Table<SessionLineOut>
        rowKey="inventory_count_session_line_id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 100, showSizeChanger: true, showTotal: (t) => `${t} позиций` }}
        locale={{
          emptyText:
            filter === "all"
              ? "Лист пуст — добавьте позиции кнопкой «Добавить позицию»"
              : "Ничего не подходит под фильтр",
        }}
      />

      <Modal
        title="Закрыть инвентаризацию с проводкой"
        open={closeOpen}
        onCancel={() => setCloseOpen(false)}
        onOk={() => close.mutate()}
        okText="Провести"
        cancelText="Отмена"
        confirmLoading={close.isPending}
        okButtonProps={{ disabled: uncounted > 0 && !allowUncounted }}
      >
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: "c", label: "Посчитано", children: `${stats.counted} из ${stats.total}` },
            { key: "d", label: "Нестыковок", children: String(stats.diffs) },
            {
              key: "v",
              label: "Итог по деньгам",
              children: <Money value={String(stats.value)} />,
            },
          ]}
        />
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message="Что произойдёт"
          description="На каждый склад с расхождениями создастся документ «Инвентаризация» и сразу проведётся: остатки станут равны факту, недостача спишется по средней себестоимости, излишек приходуется. Позиции, где факт совпал с учётом, проводить нечего — они останутся в листе как «сходится»."
        />
        {uncounted > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message={`Не посчитано позиций: ${uncounted}`}
            description={
              <Space direction="vertical">
                <span>
                  Их остатки не изменятся. В полной инвентаризации «не посчитано»
                  почти всегда значит «не дошли до полки».
                </span>
                <Checkbox
                  checked={allowUncounted}
                  onChange={(e) => setAllowUncounted(e.target.checked)}
                >
                  Всё равно закрыть, оставив их как есть
                </Checkbox>
              </Space>
            }
          />
        )}
      </Modal>

      <Modal
        title="Добавить позицию в лист"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => addLine.mutate()}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={addLine.isPending}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Select
            style={{ width: "100%" }}
            placeholder="Склад"
            value={addWarehouse}
            onChange={setAddWarehouse}
            options={(session?.warehouses ?? []).map((w) => ({
              value: w.warehouse_id,
              label: w.warehouse_name,
            }))}
          />
          <Select
            showSearch
            style={{ width: "100%" }}
            placeholder="Товар"
            optionFilterProp="label"
            value={addProduct}
            loading={products.isPending}
            onChange={setAddProduct}
            options={products.options}
          />
          <Alert
            type="info"
            showIcon
            message="Позиция добавится с пустым фактом — её ещё надо посчитать."
          />
        </Space>
      </Modal>

      {session?.status === "posted" && (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 16 }}
          message="Сессия проведена"
          description={
            <Space wrap>
              <span>Документы:</span>
              {session.warehouses
                .filter((w) => w.document_id)
                .map((w) => (
                  <Tag
                    key={w.warehouse_id}
                    color="blue"
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/documents/${w.document_id}`)}
                  >
                    {w.warehouse_name}: №{w.document_number ?? w.document_id}
                  </Tag>
                ))}
              {session.warehouses.every((w) => !w.document_id) && (
                <span>расхождений не было, проводить было нечего</span>
              )}
            </Space>
          }
        />
      )}
    </div>
  );
}
