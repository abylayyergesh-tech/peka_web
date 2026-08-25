/** /production-plan — выпуск продукции: прогноз и факт.
 *
 * Две вкладки об одном и том же наборе строк:
 *   • «День» — рабочий лист: план на день, факт по итогу, отклонение и примечание.
 *     Правится здесь же и сохраняется одной кнопкой (день уходит целиком).
 *   • «Период» — свод по продуктам за интервал: сколько планировали, сколько
 *     сделали, процент выполнения. Только чтение — это отчёт, а не ввод.
 *
 * Тот же лист вбивают с телефона в кабинете сотрудника (peka_staff → Склад →
 * Выпуск): ручка одна, данные общие. Право — `inventory.manage` (owner, manager,
 * АУП), то же, что и на остальной складской раздел.
 *
 * Пустое поле и ноль — разные вещи: пусто значит «не заполняли», ноль — «ничего
 * не вышло». Ноль это результат смены, и превращать его в пусто нельзя.
 */
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Card, Col, DatePicker, Input, InputNumber, Popconfirm, Row,
  Select, Space, Statistic, Table, Tabs, Tag, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getProductionPlan, getProductionPlanPeriod, saveProductionPlan,
  type ProductionPlanLineIn,
} from "@/api/production";
import { useTabParam } from "@/components/useTabParam";
import { fmtQty } from "@/components/format";
import { useProductsLookup } from "@/pages/inventory/shared";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";

const TABS = ["day", "period"] as const;

export default function ProductionPlanPage() {
  const [tab, setTab] = useTabParam("day", TABS);

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>Выпуск продукции</h2>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "day", label: "День", children: <DayTab /> },
          { key: "period", label: "Период", children: <PeriodTab /> },
        ]}
      />
    </div>
  );
}

// ------------------------------------------------------------------ день
/** Правки по строке. null — «пусто» (не заполняли). */
interface Draft {
  planned: number | null;
  actual: number | null;
  note: string;
}

interface SheetRow {
  product_id: number;
  product_name: string;
  unit_name: string | null;
  planned: number | null;
  actual: number | null;
  note: string;
  /** Есть ли строка на сервере — от этого зависит, надо ли её удалять. */
  saved: boolean;
}

function num(v: string | null): number | null {
  return v == null ? null : Number(v);
}

function DayTab() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const products = useProductsLookup();

  const [day, setDay] = useState<Dayjs>(dayjs());
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [added, setAdded] = useState<number[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const [picker, setPicker] = useState<number | undefined>();

  const date = day.format("YYYY-MM-DD");

  const plan = useQuery({
    queryKey: ["production-plan", date],
    queryFn: () => getProductionPlan(date),
  });

  /** Смена дня сбрасывает правки — иначе они уехали бы в чужую дату. Если правки
   *  есть, сначала спрашиваем: терять заполненный лист от случайного клика по
   *  календарю нельзя. */
  function switchDay(next: Dayjs) {
    const apply = () => {
      setDay(next);
      setDrafts({});
      setAdded([]);
      setRemoved([]);
      setPicker(undefined);
    };
    if (!dirty) {
      apply();
      return;
    }
    modal.confirm({
      title: "Сменить день?",
      content: "Незаписанные правки пропадут — сохраните их сначала.",
      okText: "Сменить",
      cancelText: "Отмена",
      okButtonProps: { danger: true },
      onOk: apply,
    });
  }

  const rows: SheetRow[] = useMemo(() => {
    const serverRows = plan.data ?? [];
    const out: SheetRow[] = [];
    for (const r of serverRows) {
      if (removed.includes(r.product_id)) continue;
      const d = drafts[r.product_id];
      out.push({
        product_id: r.product_id,
        product_name: r.product_name,
        unit_name: r.unit_name,
        planned: d ? d.planned : num(r.planned_quantity),
        actual: d ? d.actual : num(r.actual_quantity),
        note: d ? d.note : r.note ?? "",
        saved: true,
      });
    }
    const known = new Set(serverRows.map((r) => r.product_id));
    for (const pid of added) {
      if (known.has(pid) || removed.includes(pid)) continue;
      const product = products.byId.get(pid);
      const d = drafts[pid];
      out.push({
        product_id: pid,
        product_name: product?.name ?? `#${pid}`,
        unit_name: null,
        planned: d ? d.planned : null,
        actual: d ? d.actual : null,
        note: d ? d.note : "",
        saved: false,
      });
    }
    out.sort((a, b) => a.product_name.localeCompare(b.product_name));
    return out;
  }, [plan.data, drafts, added, removed, products.byId]);

  const totals = useMemo(() => {
    const withPlan = rows.filter((r) => r.planned != null).length;
    const withActual = rows.filter((r) => r.actual != null).length;
    const off = rows.filter(
      (r) => r.planned != null && r.actual != null && r.planned !== r.actual,
    ).length;
    return { positions: rows.length, withPlan, withActual, off };
  }, [rows]);

  const dirty =
    Object.keys(drafts).length > 0 || added.length > 0 || removed.length > 0;
  useUnsavedChanges(dirty, "Правки плана не сохранены — они потеряются.");

  /** Правка ложится поверх ТЕКУЩИХ значений строки: `row` уже собран с учётом
   *  предыдущих правок. */
  function setDraft(row: SheetRow, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [row.product_id]: {
        planned: row.planned,
        actual: row.actual,
        note: row.note,
        ...patch,
      },
    }));
  }

  const save = useMutation({
    mutationFn: () => {
      const lines: ProductionPlanLineIn[] = rows.map((r) => ({
        product_id: r.product_id,
        planned_quantity: r.planned == null ? null : String(r.planned),
        actual_quantity: r.actual == null ? null : String(r.actual),
        note: r.note.trim() || null,
      }));
      // Убранные позиции уходят пустой строкой — так сервер их и удаляет.
      for (const pid of removed) lines.push({ product_id: pid });
      return saveProductionPlan(date, lines);
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(["production-plan", date], fresh);
      setDrafts({});
      setAdded([]);
      setRemoved([]);
      message.success("Выпуск сохранён");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const pickerOptions = useMemo(() => {
    const inSheet = new Set(rows.map((r) => r.product_id));
    return products.options.filter((o) => !inSheet.has(o.value));
  }, [products.options, rows]);

  const columns: ColumnsType<SheetRow> = [
    {
      title: "Продукт",
      dataIndex: "product_name",
      render: (name: string, row) => (
        <Space size={6}>
          <span>{name}</span>
          {row.unit_name && (
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>{row.unit_name}</span>
          )}
          {!row.saved && <Tag color="blue">новая</Tag>}
        </Space>
      ),
      sorter: (a, b) => a.product_name.localeCompare(b.product_name),
    },
    {
      title: "Прогноз",
      key: "planned",
      width: 150,
      render: (_, row) => (
        <InputNumber
          min={0}
          style={{ width: "100%" }}
          placeholder="—"
          value={row.planned ?? undefined}
          onChange={(v) => setDraft(row, { planned: v ?? null })}
        />
      ),
    },
    {
      title: "Факт",
      key: "actual",
      width: 150,
      render: (_, row) => (
        <InputNumber
          min={0}
          style={{ width: "100%" }}
          placeholder="—"
          value={row.actual ?? undefined}
          onChange={(v) => setDraft(row, { actual: v ?? null })}
        />
      ),
    },
    {
      title: "Отклонение",
      key: "diff",
      align: "right",
      width: 150,
      render: (_, row) => {
        if (row.planned == null || row.actual == null) {
          return <span style={{ color: "#bbb" }}>—</span>;
        }
        const diff = row.actual - row.planned;
        if (diff === 0) return <Tag color="green">по плану</Tag>;
        const percent = row.planned > 0 ? Math.round((row.actual / row.planned) * 100) : null;
        return (
          <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
            <b style={{ color: diff < 0 ? "#cf1322" : "#389e0d" }}>
              {diff > 0 ? "+" : ""}
              {fmtQty(diff)}
            </b>
            {percent != null && (
              <span style={{ color: "#999", fontSize: 12 }}>{percent}%</span>
            )}
          </Space>
        );
      },
    },
    {
      title: "Примечание",
      key: "note",
      width: 260,
      render: (_, row) => (
        <Input
          placeholder="необязательно"
          maxLength={1000}
          value={row.note}
          onChange={(e) => setDraft(row, { note: e.target.value })}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_, row) => (
        <Popconfirm
          title="Убрать позицию из листа?"
          okText="Убрать"
          cancelText="Отмена"
          onConfirm={() => {
            setRemoved((prev) => (row.saved ? [...prev, row.product_id] : prev));
            setAdded((prev) => prev.filter((p) => p !== row.product_id));
            setDrafts((prev) => {
              const next = { ...prev };
              delete next[row.product_id];
              return next;
            });
          }}
        >
          <Button type="text" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker
          allowClear={false}
          format="DD.MM.YYYY"
          value={day}
          onChange={(v) => v && switchDay(v)}
        />
        <Button onClick={() => switchDay(dayjs())}>Сегодня</Button>
        <Button
          icon={<ReloadOutlined />}
          loading={plan.isFetching}
          onClick={() => plan.refetch()}
          // Обновление затрёт незаписанные правки — не даём потерять их молча.
          disabled={dirty}
        >
          Обновить
        </Button>
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          placeholder="Добавить позицию"
          style={{ width: 280 }}
          loading={products.isPending}
          options={pickerOptions}
          value={picker}
          onChange={(v) => setPicker(v)}
        />
        <Button
          icon={<PlusOutlined />}
          disabled={picker == null}
          onClick={() => {
            if (picker == null) return;
            setAdded((prev) => [...prev, picker]);
            setRemoved((prev) => prev.filter((p) => p !== picker));
            setPicker(undefined);
          }}
        >
          Добавить
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={save.isPending}
          disabled={!dirty}
          onClick={() => save.mutate()}
        >
          Сохранить день
        </Button>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Позиций в листе" value={totals.positions} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="С прогнозом" value={totals.withPlan} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="С фактом" value={totals.withActual} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Отклонений"
              value={totals.off}
              valueStyle={totals.off ? { color: "#cf1322" } : undefined}
            />
          </Card>
        </Col>
      </Row>

      {dirty && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Есть несохранённые правки"
          description="Нажмите «Сохранить день» — иначе они пропадут при смене даты или обновлении."
        />
      )}

      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Пустое поле — «не заполняли». Ноль — это результат: ничего не делали или
        ничего не вышло. Строка без прогноза, факта и примечания при сохранении
        убирается из листа.
      </Typography.Paragraph>

      <Table<SheetRow>
        rowKey="product_id"
        size="small"
        loading={plan.isPending || products.isPending}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true, hideOnSinglePage: true }}
      />
    </div>
  );
}

// --------------------------------------------------------------- период
interface PeriodRow {
  product_id: number;
  product_name: string;
  unit_name: string | null;
  planned: number;
  actual: number;
  /** Дней, в которых по продукту есть хоть одна цифра. */
  days: number;
}

function PeriodTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const from = range[0].format("YYYY-MM-DD");
  const to = range[1].format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["production-plan", "period", from, to],
    queryFn: () => getProductionPlanPeriod(from, to),
  });

  /** Свод по продукту: суммы плана и факта за период. Складывать штуки разных
   *  продуктов между собой нельзя, поэтому итог считается ПО СТРОКАМ продукта, а
   *  общей суммы «всего выпущено» здесь нет — она была бы бессмысленной. */
  const rows = useMemo(() => {
    const acc = new Map<number, PeriodRow>();
    for (const r of query.data ?? []) {
      const cur = acc.get(r.product_id) ?? {
        product_id: r.product_id,
        product_name: r.product_name,
        unit_name: r.unit_name,
        planned: 0,
        actual: 0,
        days: 0,
      };
      cur.planned += Number(r.planned_quantity ?? 0);
      cur.actual += Number(r.actual_quantity ?? 0);
      cur.days += 1;
      acc.set(r.product_id, cur);
    }
    return Array.from(acc.values()).sort((a, b) =>
      a.product_name.localeCompare(b.product_name),
    );
  }, [query.data]);

  const columns: ColumnsType<PeriodRow> = [
    {
      title: "Продукт",
      dataIndex: "product_name",
      render: (name: string, row) => (
        <Space size={6}>
          <span>{name}</span>
          {row.unit_name && (
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>{row.unit_name}</span>
          )}
        </Space>
      ),
      sorter: (a, b) => a.product_name.localeCompare(b.product_name),
    },
    { title: "Дней", dataIndex: "days", align: "right", width: 90 },
    {
      title: "Прогноз",
      dataIndex: "planned",
      align: "right",
      width: 140,
      sorter: (a, b) => a.planned - b.planned,
      render: (v: number) => fmtQty(v),
    },
    {
      title: "Факт",
      dataIndex: "actual",
      align: "right",
      width: 140,
      defaultSortOrder: "descend",
      sorter: (a, b) => a.actual - b.actual,
      render: (v: number) => fmtQty(v),
    },
    {
      title: "Отклонение",
      key: "diff",
      align: "right",
      width: 160,
      render: (_, row) => {
        const diff = row.actual - row.planned;
        if (row.planned === 0 && row.actual === 0) {
          return <span style={{ color: "#bbb" }}>—</span>;
        }
        if (diff === 0) return <Tag color="green">по плану</Tag>;
        const percent = row.planned > 0 ? Math.round((row.actual / row.planned) * 100) : null;
        return (
          <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
            <b style={{ color: diff < 0 ? "#cf1322" : "#389e0d" }}>
              {diff > 0 ? "+" : ""}
              {fmtQty(diff)}
            </b>
            {percent != null && (
              <span style={{ color: "#999", fontSize: 12 }}>{percent}%</span>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker
          allowClear={false}
          format="DD.MM.YYYY"
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
        />
        <Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>
          Обновить
        </Button>
      </Space>

      <Table<PeriodRow>
        rowKey="product_id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true, hideOnSinglePage: true }}
      />
    </div>
  );
}
