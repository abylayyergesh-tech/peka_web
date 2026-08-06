/** /transfer — перемещение по складам: переставить товар с одного склада на другой.
 *
 * Раньше перемещение можно было завести только через общую форму документа
 * («Документы» → «Новый» → тип «Перемещение»), где строки набираются вслепую: ни
 * что лежит на складе-источнике, ни сколько его там, форма не показывает. Отсюда
 * отказы при проведении — «списали больше, чем есть» — уже после того, как
 * человек вбил десяток строк. Здесь лист строится ПО ОСТАТКАМ склада-источника,
 * и рядом с каждой позицией видно доступное количество и то, что останется.
 *
 * Что перемещение делает с учётом: везёт КОЛИЧЕСТВО и не трогает деньги.
 * Стоимость в системе принадлежит товару, а не складу (см. app/inventory/domain
 * apply_transfer), поэтому перевозка не может ни создать, ни уничтожить, ни
 * перераспределить стоимость — на обеих проводках `cost_delta = 0`. Поэтому на
 * этом экране нет ни цен, ни сумм: их тут просто нечему менять.
 *
 * Количество вводится в БАЗОВОЙ единице позиции — в ней же показан остаток, и в
 * ней же он изменится на обоих складах. Выбор единицы строки был бы лишней
 * развилкой: перевозят своё, а не принимают чужую упаковку.
 *
 * Проводится сразу: черновик перемещения никому не нужен — товар или переехал,
 * или нет. Если провести не удалось (чаще всего остаток успел уйти), черновик
 * убираем за собой, потому что количества всё равно придётся перебивать.
 */
import { ReloadOutlined, SearchOutlined, SwapOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Card, Col, DatePicker, Input, InputNumber, Modal,
  Popconfirm, Row, Select, Space, Statistic, Switch, Table, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listUnits } from "@/api/catalog";
import { errorCode, errorMessage, fetchAllPages } from "@/api/client";
import {
  createDocument, deleteDocument, postDocument, type ConsumptionLineIn,
} from "@/api/inventory";
import { getStock, type StockRow } from "@/api/reports";
import { useCan } from "@/auth/store";
import { fmtQty } from "@/components/format";
import { nameOf, useProductsLookup, useWarehousesLookup } from "@/pages/inventory/shared";

/** Введённое по строке: сколько увезти. null — строку не трогали. */
type Moving = Record<number, number | null>;

interface MovedRow {
  product_id: number;
  quantity: number;
}

export default function TransferPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useCan("inventory.manage");
  const products = useProductsLookup();
  const warehouses = useWarehousesLookup();

  const [sourceId, setSourceId] = useState<number | undefined>();
  const [targetId, setTargetId] = useState<number | undefined>();
  const [docDate, setDocDate] = useState<Dayjs>(dayjs());
  const [search, setSearch] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [moving, setMoving] = useState<Moving>({});
  const [result, setResult] = useState<
    { id: number; number: number | null; rows: MovedRow[] } | null
  >(null);

  const units = useQuery({
    queryKey: ["lookup", "units", "all"],
    queryFn: () => fetchAllPages((pg) => listUnits(pg)),
    staleTime: 60_000,
  });
  const unitById = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.unit_id, u.name])),
    [units.data],
  );
  const unitOf = (id: number) => {
    const p = products.byId.get(id);
    return p ? unitById.get(p.base_unit_id) ?? "" : "";
  };

  const stock = useQuery({
    queryKey: ["stock", { warehouseId: sourceId }],
    queryFn: () => getStock({ warehouse_id: sourceId }),
    enabled: sourceId != null,
  });

  /** Лист источника. Позиции без остатка не показываем вовсе: перемещать нечего,
   *  а сервер такую строку всё равно отклонит (недостаток остатка). */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock.data ?? [])
      .filter((r) => {
        if (Number(r.quantity) <= 0) return false;
        if (onlyPicked && !(moving[r.product_id] ?? 0)) return false;
        if (!q) return true;
        return nameOf(products.byId, r.product_id).toLowerCase().includes(q);
      })
      .sort((a, b) =>
        nameOf(products.byId, a.product_id).localeCompare(
          nameOf(products.byId, b.product_id),
        ),
      );
  }, [stock.data, search, onlyPicked, moving, products.byId]);

  /** Что реально уедет: строки с положительным количеством. */
  const picked = useMemo(
    () =>
      (stock.data ?? [])
        .map((r) => ({ row: r, qty: moving[r.product_id] ?? 0 }))
        .filter((p) => p.qty > 0),
    [stock.data, moving],
  );

  /** Строки, где просят больше, чем лежит: сервер откажет по всему документу,
   *  поэтому проводить не даём и показываем, какие именно. */
  const overdrawn = useMemo(
    () => picked.filter((p) => p.qty > Number(p.row.quantity)),
    [picked],
  );

  const save = useMutation({
    mutationFn: async () => {
      const lines: ConsumptionLineIn[] = [];
      for (const { row, qty } of picked) {
        const product = products.byId.get(row.product_id);
        if (!product) continue;
        lines.push({
          product_id: row.product_id,
          quantity: String(qty),
          unit_id: product.base_unit_id,
        });
      }
      if (lines.length === 0) throw new Error("Не выбрано ни одной позиции");
      const doc = await createDocument({
        type: "transfer",
        doc_date: docDate.format("YYYY-MM-DD"),
        warehouse_id: sourceId as number,
        target_warehouse_id: targetId as number,
        lines,
      });
      try {
        return await postDocument(doc.document_id);
      } catch (e) {
        // Черновик убираем: количества придётся перебивать по свежим остаткам, а
        // непроведённое перемещение в журнале только путает.
        try {
          await deleteDocument(doc.document_id);
        } catch {
          /* не удалось убрать — документ остался черновиком, это не потеря */
        }
        throw e;
      }
    },
    onSuccess: (doc) => {
      setResult({
        id: doc.document_id,
        number: doc.number,
        rows: picked.map((p) => ({ product_id: p.row.product_id, quantity: p.qty })),
      });
      setMoving({});
      setOnlyPicked(false);
      // Остатки поменялись на ОБОИХ складах — перечитываем все их разрезы.
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e) => {
      if (errorCode(e) === "insufficient_stock") {
        message.error(
          "На складе-источнике не хватило остатка — нажмите «Обновить остатки» и перебейте количества.",
        );
        return;
      }
      message.error(errorMessage(e));
    },
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
      title: "Доступно",
      dataIndex: "quantity",
      align: "right",
      width: 160,
      sorter: (a, b) => Number(a.quantity) - Number(b.quantity),
      render: (v: string, row) => `${fmtQty(v)} ${unitOf(row.product_id)}`,
    },
    {
      title: "Переместить",
      key: "move",
      width: 170,
      render: (_, row) => {
        const available = Number(row.quantity);
        const qty = moving[row.product_id] ?? null;
        return (
          <InputNumber
            min={0}
            max={available}
            style={{ width: "100%" }}
            disabled={!canManage || targetId == null}
            value={qty ?? undefined}
            placeholder="0"
            status={qty != null && qty > available ? "error" : undefined}
            onChange={(v) =>
              setMoving((prev) => ({ ...prev, [row.product_id]: v ?? null }))
            }
          />
        );
      },
    },
    {
      title: "Останется",
      key: "left",
      align: "right",
      width: 160,
      render: (_, row) => {
        const qty = moving[row.product_id] ?? 0;
        if (!qty) return <span style={{ color: "#bbb" }}>—</span>;
        const left = Number(row.quantity) - qty;
        return (
          <b style={{ color: left < 0 ? "#cf1322" : undefined }}>
            {fmtQty(String(left))} {unitOf(row.product_id)}
          </b>
        );
      },
    },
  ];

  /** Куда: тот же склад выбрать нельзя — сервер отвергает такой документ, и это
   *  правильно, перемещение «в себя» ничего не значит. */
  const targetOptions = warehouses.options.filter((o) => o.value !== sourceId);
  const ready =
    canManage && sourceId != null && targetId != null && picked.length > 0 &&
    overdrawn.length === 0;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Перемещение по складам</h2>

      {!canManage && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Только просмотр"
          description="Перемещать товар может тот, кто ведёт склад — нужно право inventory.manage."
        />
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Откуда"
          style={{ width: 240 }}
          options={warehouses.options}
          value={sourceId}
          onChange={(v) => {
            setSourceId(v);
            setMoving({});
            setResult(null);
            // Источник и получатель совпасть не могут: если выбрали склад, уже
            // стоящий в «Куда», получателя сбрасываем.
            if (v === targetId) setTargetId(undefined);
          }}
        />
        <SwapOutlined style={{ color: "#8c8c8c" }} />
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Куда"
          style={{ width: 240 }}
          options={targetOptions}
          value={targetId}
          onChange={(v) => setTargetId(v)}
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
          disabled={sourceId == null}
          loading={stock.isFetching}
        >
          Обновить остатки
        </Button>
        <Space size={6}>
          <Switch checked={onlyPicked} onChange={setOnlyPicked} />
          <span>Только выбранные</span>
        </Space>
      </Space>

      {sourceId == null ? (
        <Alert
          type="info"
          showIcon
          message="Выберите склад-источник"
          description="Лист перемещения строится по его остаткам: перемещать можно только то, что на нём есть."
        />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Позиций к перемещению" value={picked.length} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Куда"
                  value={
                    targetId == null ? "не выбрано" : nameOf(warehouses.byId, targetId)
                  }
                  valueStyle={{ fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card size="small">
                <Popconfirm
                  title="Провести перемещение?"
                  description="Товар сразу уйдёт с одного склада и появится на другом."
                  okText="Провести"
                  cancelText="Отмена"
                  disabled={!ready}
                  onConfirm={() => save.mutate()}
                >
                  <Button
                    type="primary"
                    icon={<SwapOutlined />}
                    block
                    loading={save.isPending}
                    disabled={!ready}
                  >
                    Переместить
                  </Button>
                </Popconfirm>
              </Card>
            </Col>
          </Row>

          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            Количество — в базовой единице позиции, в ней же показан остаток.
            Позиции без остатка на складе-источнике в лист не попадают: перемещать
            нечего. Стоимость перемещение не меняет — переезжает только количество.
          </Typography.Paragraph>

          {targetId == null && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Выберите склад-получатель"
              description="Пока не выбран, количества вводить нельзя — товару некуда ехать."
            />
          )}

          {overdrawn.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Больше, чем лежит: ${overdrawn.length} поз.`}
              description="Сервер откажет по всему документу целиком — уменьшите количество или обновите остатки."
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
        width={640}
        title={
          result?.number != null
            ? `Перемещение № ${result.number} проведено`
            : "Перемещение проведено"
        }
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
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Переехало позиций: ${result?.rows.length ?? 0}`}
          description="Остатки обоих складов уже изменились. Стоимость товара осталась прежней — перемещение её не двигает."
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
              title: "Перемещено",
              dataIndex: "quantity",
              align: "right",
              render: (v: number, row: MovedRow) =>
                `${fmtQty(String(v))} ${unitOf(row.product_id)}`,
            },
          ]}
        />
      </Modal>
    </div>
  );
}
