/** /inventory-count — инвентаризация: перебить остатки склада по факту.
 *
 * Экран устроен как лист пересчёта: слева то, что система считает лежащим на
 * складе, справа поле «по факту». Разница считается на месте, до записи, поэтому
 * человек видит нестыковку раньше, чем она попадёт в учёт.
 *
 * Проводится документом `inventory_count` — тем же движком, что приходы и
 * списания, поэтому пересчёт остаётся в журнале движений и в себестоимости:
 * излишек приходуется по средней, недостача списывается по ней же. Там, где
 * средней нет (остаток нулевой или минусовой), появляется колонка цены — иначе
 * стоимость возникла бы из ничего, и сервер такую строку не примет.
 *
 * Право отдельное — `inventory.count`: перебить остаток значит исправить факт, и
 * это дело администрации (owner/manager и АУП), а не любого, кто ведёт склад.
 * Тот же экран есть в кабинете сотрудника (peka_staff) — под телефон.
 *
 * Ожидаемое количество уезжает на бэкенд в `expected_quantity`: это оптимистичная
 * блокировка. Если между открытием листа и записью кто-то провёл приход, сервер
 * откажет вместо того, чтобы затереть чужое движение.
 */
import { ReloadOutlined, SaveOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Card, Col, DatePicker, Input, InputNumber, Modal, Popconfirm,
  Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { createDocument, postDocument, type InventoryCountLineIn } from "@/api/inventory";
import { getStock, type StockRow } from "@/api/reports";
import { useCan } from "@/auth/store";
import { Money, fmtMoney, fmtQty } from "@/components/format";
import { nameOf, useProductsLookup, useWarehousesLookup } from "@/pages/inventory/shared";

/** Введённый факт по строке: пусто — не считали, строку не отправляем. */
type Counted = Record<number, number | null>;

/** Цена за единицу для позиций, которым нужна оценка излишка (см. needsPrice). */
type Priced = Record<number, number | null>;

/** Нужна ли цена по строке. Излишек оценивается по средней себестоимости, но её
 *  нет, когда позиция числится по нулю: остаток нулевой или минусовой (списали
 *  больше, чем приходовали — на складе таких позиций хватает). Тогда сервер
 *  требует явную цену, иначе стоимость возникла бы из ничего. Условие повторяет
 *  проверку в app/inventory/service.py — расхождение здесь означало бы отказ
 *  при проведении, причём уже после того, как человек обошёл все полки. */
function needsPrice(row: { quantity: string; cost_balance: string }, fact: number) {
  const expected = Number(row.quantity);
  if (fact <= expected) return false; // недостача оценивается по тому, что есть
  return expected === 0 || Number(row.cost_balance) === 0;
}

export default function StockCountPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const canCount = useCan("inventory.count");
  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();

  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [docDate, setDocDate] = useState<Dayjs>(dayjs());
  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [counted, setCounted] = useState<Counted>({});
  const [priced, setPriced] = useState<Priced>({});
  const [result, setResult] = useState<{ id: number; rows: DiffRow[] } | null>(null);

  const stock = useQuery({
    queryKey: ["stock", { warehouseId }],
    queryFn: () => getStock({ warehouse_id: warehouseId }),
    enabled: warehouseId != null,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock.data ?? []).filter((r) => {
      if (hideZero && Number(r.quantity) === 0 && counted[r.product_id] == null) return false;
      if (!q) return true;
      return nameOf(products.byId, r.product_id).toLowerCase().includes(q);
    });
  }, [stock.data, search, hideZero, counted, products.byId]);

  /** Расхождения по введённому: только там, где факт отличается от учёта. */
  const diffs = useMemo(() => {
    const out: DiffRow[] = [];
    for (const r of stock.data ?? []) {
      const fact = counted[r.product_id];
      if (fact == null) continue;
      const expected = Number(r.quantity);
      if (fact === expected) continue;
      out.push({
        product_id: r.product_id,
        expected,
        fact,
        diff: fact - expected,
        unit_value: needsPrice(r, fact)
          ? priced[r.product_id] ?? 0
          : Number(r.avg_cost),
      });
    }
    return out;
  }, [stock.data, counted, priced]);

  const filledCount = Object.values(counted).filter((v) => v != null).length;
  const valueDelta = diffs.reduce((sum, d) => sum + d.diff * d.unit_value, 0);

  /** Строки, где цена нужна, но не введена: проводить нельзя — сервер откажет. */
  const missingPrice = useMemo(
    () =>
      (stock.data ?? []).filter((r) => {
        const fact = counted[r.product_id];
        return fact != null && needsPrice(r, fact) && !priced[r.product_id];
      }),
    [stock.data, counted, priced],
  );

  const save = useMutation({
    mutationFn: async () => {
      const lines: InventoryCountLineIn[] = [];
      for (const r of stock.data ?? []) {
        const fact = counted[r.product_id];
        if (fact == null) continue;
        const product = products.byId.get(r.product_id);
        if (!product) continue;
        const price = needsPrice(r, fact) ? priced[r.product_id] : null;
        lines.push({
          product_id: r.product_id,
          quantity: String(fact),
          unit_id: product.base_unit_id,
          // Оптимистичная блокировка: если остаток успел измениться, сервер
          // откажет, а не перезапишет чужое движение.
          expected_quantity: r.quantity,
          ...(price ? { price: String(price) } : {}),
        });
      }
      if (lines.length === 0) throw new Error("Не заполнено ни одной строки");
      const doc = await createDocument({
        type: "inventory_count",
        doc_date: docDate.format("YYYY-MM-DD"),
        warehouse_id: warehouseId as number,
        lines,
      });
      await postDocument(doc.document_id);
      return doc.document_id;
    },
    onSuccess: (id) => {
      // Расхождения показываем ПОСЛЕ проведения: до этого момента цифры ещё
      // могут поменяться, а после — это уже факт учёта.
      setResult({ id, rows: diffs });
      setCounted({});
      setPriced({});
      stock.refetch();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<StockRow> = [
    {
      title: "Продукт",
      dataIndex: "product_id",
      render: (id: number) => nameOf(products.byId, id),
      sorter: (a, b) =>
        nameOf(products.byId, a.product_id).localeCompare(
          nameOf(products.byId, b.product_id),
        ),
    },
    {
      title: "По учёту",
      dataIndex: "quantity",
      align: "right",
      width: 130,
      render: (v: string) => fmtQty(v),
    },
    {
      title: "По факту",
      key: "fact",
      width: 150,
      render: (_, row) => (
        <InputNumber
          min={0}
          style={{ width: "100%" }}
          disabled={!canCount}
          value={counted[row.product_id] ?? undefined}
          placeholder="не считали"
          onChange={(v) =>
            setCounted((prev) => ({ ...prev, [row.product_id]: v ?? null }))
          }
        />
      ),
    },
    {
      // Цена нужна только там, где излишек не оценить по средней: остаток
      // нулевой или минусовой, стоимости на позиции нет. В остальных строках
      // колонка пустая — сюда лезть незачем.
      title: "Цена за ед.",
      key: "price",
      width: 150,
      render: (_, row) => {
        const fact = counted[row.product_id];
        if (fact == null || !needsPrice(row, fact)) {
          return <span style={{ color: "#bbb" }}>—</span>;
        }
        const price = priced[row.product_id] ?? null;
        return (
          <Tooltip
            title={
              Number(row.quantity) < 0
                ? "Остаток минусовой: средней себестоимости нет, излишек надо оценить"
                : "Позиция числится по нулю: излишек надо оценить"
            }
          >
            <InputNumber
              min={0}
              step={0.01}
              style={{ width: "100%" }}
              status={price ? undefined : "warning"}
              disabled={!canCount}
              value={price ?? undefined}
              placeholder="нужна цена"
              onChange={(v) =>
                setPriced((prev) => ({ ...prev, [row.product_id]: v ?? null }))
              }
            />
          </Tooltip>
        );
      },
    },
    {
      title: "Разница",
      key: "diff",
      align: "right",
      width: 160,
      render: (_, row) => {
        const fact = counted[row.product_id];
        if (fact == null) return <span style={{ color: "#bbb" }}>—</span>;
        const diff = fact - Number(row.quantity);
        if (diff === 0) return <Tag color="green">сходится</Tag>;
        const unitValue = needsPrice(row, fact)
          ? priced[row.product_id] ?? 0
          : Number(row.avg_cost);
        return (
          <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
            <b style={{ color: diff < 0 ? "#cf1322" : "#389e0d" }}>
              {diff > 0 ? "+" : ""}
              {fmtQty(String(diff))}
            </b>
            <span style={{ color: "#999", fontSize: 12 }}>
              {fmtMoney(diff * unitValue)}
            </span>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Инвентаризация</h2>

      {!canCount && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Только просмотр"
          description="Проводить инвентаризацию может администрация — нужно право inventory.count."
        />
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Выберите склад"
          style={{ width: 260 }}
          options={warehouses.options}
          value={warehouseId}
          onChange={(v) => {
            setWarehouseId(v);
            setCounted({});
            setResult(null);
          }}
        />
        <DatePicker
          format="DD.MM.YYYY"
          value={docDate}
          onChange={(v) => v && setDocDate(v)}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Поиск по названию"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => stock.refetch()}
          disabled={warehouseId == null}
        >
          Обновить остатки
        </Button>
        <Tooltip title={hideZero ? "Показать и нулевые остатки" : "Скрыть нулевые"}>
          <Button onClick={() => setHideZero((v) => !v)}>
            {hideZero ? "С нулевыми" : "Только с остатком"}
          </Button>
        </Tooltip>
      </Space>

      {warehouseId == null ? (
        <Alert
          type="info"
          showIcon
          message="Выберите склад"
          description="Лист пересчёта строится по остаткам выбранного склада: слева учёт, справа факт."
        />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Заполнено строк" value={filledCount} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Расхождений"
                  value={diffs.length}
                  valueStyle={diffs.length ? { color: "#cf1322" } : undefined}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card size="small">
                <Statistic title="Итог по деньгам" value={fmtMoney(valueDelta)} />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card size="small">
                <Popconfirm
                  title="Провести инвентаризацию?"
                  description="Остатки станут равны факту, разница уйдёт в журнал движений и в себестоимость."
                  okText="Провести"
                  cancelText="Отмена"
                  disabled={!canCount || filledCount === 0 || missingPrice.length > 0}
                  onConfirm={() => save.mutate()}
                >
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    block
                    loading={save.isPending}
                    disabled={!canCount || filledCount === 0 || missingPrice.length > 0}
                  >
                    Провести
                  </Button>
                </Popconfirm>
              </Card>
            </Col>
          </Row>

          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            Пустое поле «по факту» значит «не считали» — такая строка не
            отправляется и остаток по ней не меняется. Ноль — это результат
            пересчёта: полка пуста, и остаток станет нулевым.
          </Typography.Paragraph>

          {missingPrice.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Без цены нельзя провести: ${missingPrice.length} поз.`}
              description="У этих позиций нет средней себестоимости (остаток нулевой или минусовой), поэтому излишек надо оценить вручную — заполните «Цена за ед.»."
            />
          )}

          <Table<StockRow>
            rowKey={(r) => `${r.warehouse_id}-${r.product_id}`}
            size="small"
            loading={stock.isPending || products.isPending}
            dataSource={rows}
            columns={columns}
            pagination={{ pageSize: 50, showSizeChanger: true, hideOnSinglePage: true }}
          />
        </>
      )}

      <Modal
        open={result != null}
        onCancel={() => setResult(null)}
        title="Инвентаризация проведена"
        width={720}
        footer={
          <Space>
            <Button onClick={() => setResult(null)}>Закрыть</Button>
            <Button
              type="primary"
              onClick={() => result && navigate(`/documents/${result.id}`)}
            >
              Открыть документ
            </Button>
          </Space>
        }
      >
        {result?.rows.length === 0 ? (
          <Alert
            type="success"
            showIcon
            message="Нестыковок нет"
            description="Факт совпал с учётом по всем посчитанным позициям."
          />
        ) : (
          <>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`Нестыковок: ${result?.rows.length ?? 0}`}
              description="Разница уже проведена: остатки равны факту, стоимость расхождения ушла в себестоимость."
            />
            <Table
              rowKey="product_id"
              size="small"
              pagination={false}
              dataSource={result?.rows}
              columns={[
                {
                  title: "Продукт",
                  dataIndex: "product_id",
                  render: (id: number) => nameOf(products.byId, id),
                },
                {
                  title: "По учёту",
                  dataIndex: "expected",
                  align: "right",
                  render: (v: number) => fmtQty(String(v)),
                },
                {
                  title: "По факту",
                  dataIndex: "fact",
                  align: "right",
                  render: (v: number) => fmtQty(String(v)),
                },
                {
                  title: "Разница",
                  dataIndex: "diff",
                  align: "right",
                  render: (v: number) => (
                    <b style={{ color: v < 0 ? "#cf1322" : "#389e0d" }}>
                      {v > 0 ? "+" : ""}
                      {fmtQty(String(v))}
                    </b>
                  ),
                },
                {
                  title: "В деньгах",
                  key: "money",
                  align: "right",
                  render: (_, row: DiffRow) => (
                    <Money value={String(row.diff * row.unit_value)} />
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

interface DiffRow {
  product_id: number;
  expected: number;
  fact: number;
  diff: number;
  /** Цена, по которой оценена разница: средняя себестоимость, а для позиций с
   *  нулевой стоимостью — введённая вручную. */
  unit_value: number;
}
