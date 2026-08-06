/** /reports/abc — ABC-анализ: что кормит, а что балласт.
 *
 *  Позиции выстраиваются по убыванию выбранного показателя, и класс задаётся
 *  накопленной долей: A — верхушка, дающая первые 80 % итога, B — до 95 %, C —
 *  остальное.
 *
 *  Гибкость расчёта — три независимые оси, и все три меняют вывод отчёта:
 *    • показатель — по прибыли картина часто другая, чем по выручке, а по числу
 *      чеков видно, что берут ЧАСТО (это про место в меню, а не про деньги);
 *    • разрез — по товарам или по категориям: категория отвечает на вопрос «какое
 *      направление кормит», товар — «какая позиция внутри него»;
 *    • отбор по категории — тот же ABC внутри одного направления. Без него
 *      кондитерка с её объёмом делает все кулинарные позиции классом C.
 *
 *  Показатели — только аддитивные. Класс задаётся накопленной ДОЛЕЙ, а доля от
 *  процента (маржи, фудкоста) не имеет смысла: сервер такие значения отклоняет.
 *
 *  Отсюда же категориями и управляют: их заводят ровно в тот момент, когда видят,
 *  что разрез бесполезен, — и товары переносятся выделением прямо в таблице. */
import { AppstoreOutlined, TagsOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Segmented, Select, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  fetchAbc,
  type AbcGroupBy,
  type AbcMetric,
  type AbcRow,
} from "@/api/finance";
import { useCan } from "@/auth/store";
import AssignCategoryModal from "@/components/AssignCategoryModal";
import ProductCategoriesModal, {
  useProductCategories,
} from "@/components/ProductCategoriesModal";
import { fmtDate, fmtQty, Money } from "@/components/format";
import { fmtPct } from "@/pages/finance/labels";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";

const METRIC_LABELS: Record<AbcMetric, string> = {
  revenue: "Выручка",
  profit: "Прибыль",
  quantity: "Количество",
  cost: "Себестоимость",
  check_count: "Чеки",
};

const METRIC_HINTS: Record<AbcMetric, string> = {
  revenue: "Сколько денег принесла позиция",
  profit: "Выручка минус себестоимость — по ней картина часто другая, чем по выручке",
  quantity: "Сколько продано в базовых единицах",
  cost: "Во сколько обошлось проданное — по ней видно, что съедает закупку",
  check_count: "В скольких чеках встречается — про частоту, а не про деньги",
};

/** Количество и число чеков — не деньги, столбец показателя печатается иначе. */
const MONEY_METRICS: AbcMetric[] = ["revenue", "profit", "cost"];

const CLASS_COLORS: Record<string, string> = { A: "green", B: "gold", C: "default" };

const CLASS_HINTS: Record<string, string> = {
  A: "Кормит бизнес: следить за наличием, ценой и качеством в первую очередь",
  B: "Середина: держать, но без фанатизма",
  C: "Балласт: занимает место в меню и на складе, а даёт мало",
};

/** Пункт «без категории» в фильтре. Сервер ждёт для него ПУСТУЮ строку (отсутствие
 *  параметра значит «все категории»), но пустая строка как значение выпадающего
 *  списка неотличима от «ничего не выбрано» — отсюда отдельный ключ в интерфейсе. */
const NO_CATEGORY_KEY = "__none__";

export default function AbcReportPage() {
  const { range, setRange, params } = useReportRange();
  const [metric, setMetric] = useState<AbcMetric>("revenue");
  const [groupBy, setGroupBy] = useState<AbcGroupBy>("product");
  const [categoryKey, setCategoryKey] = useState<string | undefined>();
  const category = categoryKey === NO_CATEGORY_KEY ? "" : categoryKey;
  const canManage = useCan("catalog.manage");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  const categories = useProductCategories();

  const byCategory = groupBy === "category";

  const query = useQuery({
    queryKey: ["abc", params, metric, groupBy, category],
    queryFn: () =>
      fetchAbc({ ...params, metric, group_by: groupBy, category }),
  });

  const isMoney = MONEY_METRICS.includes(metric);
  const metricCell = (v: string) => (isMoney ? <Money value={v} /> : fmtQty(v));

  /** Строки категорий приходят с `product_id = 0` (ссылаться на категорию как на
   *  товар нельзя), поэтому ключ строки в этом разрезе — имя. */
  const rowKey = (row: AbcRow) => (byCategory ? row.name : String(row.product_id));

  const columns = useMemo<ColumnsType<AbcRow>>(() => {
    const cols: ColumnsType<AbcRow> = [
      {
        title: "Класс",
        dataIndex: "abc_class",
        width: 90,
        render: (c: string) => (
          <Tooltip title={CLASS_HINTS[c]}>
            <Tag color={CLASS_COLORS[c]}>{c}</Tag>
          </Tooltip>
        ),
        filters: [
          { text: "A", value: "A" },
          { text: "B", value: "B" },
          { text: "C", value: "C" },
        ],
        onFilter: (value, row) => row.abc_class === value,
      },
    ];
    if (byCategory) {
      cols.push(
        { title: "Категория", dataIndex: "name" },
        {
          title: "Позиций",
          dataIndex: "positions",
          width: 100,
          align: "right",
          render: (v: number | null) => v ?? "—",
        },
      );
    } else {
      cols.push(
        { title: "Артикул", dataIndex: "sku", width: 100, render: (v) => v ?? "—" },
        { title: "Товар", dataIndex: "name" },
        {
          title: "Категория",
          dataIndex: "category",
          width: 160,
          render: (v: string | null) => v || <span style={{ color: "#bfbfbf" }}>—</span>,
        },
      );
    }
    cols.push(
      {
        title: METRIC_LABELS[metric],
        dataIndex: "metric_value",
        width: 140,
        align: "right",
        render: metricCell,
      },
      {
        title: "Доля",
        dataIndex: "share_pct",
        width: 100,
        align: "right",
        render: (v: string) => fmtPct(v),
      },
      {
        title: "Накопленно",
        dataIndex: "cumulative_pct",
        width: 120,
        align: "right",
        render: (v: string) => fmtPct(v),
      },
      {
        title: "Продано",
        dataIndex: "quantity",
        width: 100,
        align: "right",
        render: (v: string) => fmtQty(v),
      },
      {
        title: "Чеков",
        dataIndex: "check_count",
        width: 90,
        align: "right",
      },
      {
        title: "Выручка",
        dataIndex: "revenue",
        width: 130,
        align: "right",
        render: (v: string) => <Money value={v} />,
      },
      {
        title: "Себестоимость",
        dataIndex: "cost",
        width: 140,
        align: "right",
        render: (v: string) => <Money value={v} />,
      },
      {
        title: "Прибыль",
        dataIndex: "profit",
        width: 130,
        align: "right",
        render: (v: string, row) => (
          <>
            <Money value={v} />
            {row.cost_missing && (
              <Tooltip
                title={
                  byCategory
                    ? "У части товаров категории себестоимость не посчитана — прибыль завышена"
                    : "Себестоимость не посчитана — прибыль завышена"
                }
              >
                <Tag color="warning" style={{ marginInlineStart: 6 }}>
                  ?
                </Tag>
              </Tooltip>
            )}
          </>
        ),
      },
      {
        title: "Маржа",
        dataIndex: "margin_pct",
        width: 100,
        align: "right",
        render: (v: string | null) => fmtPct(v),
      },
    );
    return cols;
  }, [byCategory, metric, isMoney]);

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>ABC-анализ</h2>
        <Button icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)}>
          Категории
        </Button>
      </Space>

      <Space wrap style={{ marginBottom: 8 }}>
        <ReportRangePicker value={range} onChange={setRange} />
        <Segmented<AbcGroupBy>
          value={groupBy}
          onChange={(v) => {
            setGroupBy(v);
            setSelected([]);
          }}
          options={[
            { value: "product", label: "По товарам" },
            { value: "category", label: "По категориям" },
          ]}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Все категории"
          style={{ width: 240 }}
          value={categoryKey}
          loading={categories.isPending}
          onChange={(v) => {
            setCategoryKey(v);
            setSelected([]);
          }}
          options={[
            { value: NO_CATEGORY_KEY, label: "Без категории" },
            ...(categories.data ?? []).map((c) => ({
              value: c.name,
              label: `${c.name} (${c.product_count})`,
            })),
          ]}
        />
      </Space>

      <div style={{ marginBottom: 16 }}>
        <Segmented<AbcMetric>
          value={metric}
          onChange={(v) => setMetric(v)}
          options={(Object.keys(METRIC_LABELS) as AbcMetric[]).map((m) => ({
            value: m,
            label: <Tooltip title={METRIC_HINTS[m]}>{METRIC_LABELS[m]}</Tooltip>,
          }))}
        />
      </div>

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(query.error)}
        />
      )}

      {selected.length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<AppstoreOutlined />}
          style={{ marginBottom: 12 }}
          message={`Выбрано товаров: ${selected.length}`}
          action={
            <Space>
              <Button size="small" type="primary" onClick={() => setAssignOpen(true)}>
                Перенести в категорию
              </Button>
              <Button size="small" onClick={() => setSelected([])}>
                Снять
              </Button>
            </Space>
          }
        />
      )}

      {query.data && (
        <>
          <Space wrap size={16} style={{ marginBottom: 16 }}>
            {query.data.classes.map((c) => (
              <Card key={c.abc_class} size="small" style={{ minWidth: 220 }}>
                <Space align="start">
                  <Tag color={CLASS_COLORS[c.abc_class]} style={{ fontSize: 16 }}>
                    {c.abc_class}
                  </Tag>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>
                      {isMoney ? <Money value={c.metric_value} /> : fmtQty(c.metric_value)}
                    </div>
                    <div style={{ color: "#8c8c8c", fontSize: 13 }}>
                      {c.positions} {byCategory ? "категорий" : "позиций"} ·{" "}
                      {fmtPct(c.share_pct)}
                    </div>
                    <div style={{ color: "#8c8c8c", fontSize: 13 }}>
                      прибыль <Money value={c.profit} />
                    </div>
                  </div>
                </Space>
              </Card>
            ))}
          </Space>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={
              `Показатель: ${METRIC_LABELS[query.data.metric]}. ` +
              `Период ${fmtDate(query.data.date_from)} — ${fmtDate(query.data.date_to)}` +
              (query.data.category != null
                ? `, только «${query.data.category || "без категории"}»`
                : "") +
              `. Границы классов: A до ${fmtPct(query.data.a_pct)}, ` +
              `B до ${fmtPct(query.data.b_pct)} накопленной доли. ` +
              `Позиции с нулевым или отрицательным показателем — сразу C.` +
              (byCategory
                ? " Строка — категория целиком; маржа считается от её сумм, а не как среднее по товарам."
                : "")
            }
          />

          <Table<AbcRow>
            rowKey={rowKey}
            size="small"
            loading={query.isFetching}
            dataSource={query.data.rows}
            columns={columns}
            rowSelection={
              // Выделять можно только товары: у строки-категории нет id товара, и
              // переносить «категорию в категорию» нечего.
              !byCategory && canManage
                ? {
                    selectedRowKeys: selected.map(String),
                    onChange: (keys) => setSelected(keys.map((k) => Number(k))),
                    preserveSelectedRowKeys: true,
                  }
                : undefined
            }
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              showTotal: (t) => `${t} ${byCategory ? "категорий" : "позиций"}`,
            }}
            scroll={{ x: 1700 }}
          />
        </>
      )}

      <ProductCategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />
      <AssignCategoryModal
        open={assignOpen}
        productIds={selected}
        onClose={() => setAssignOpen(false)}
        onDone={() => setSelected([])}
      />
    </div>
  );
}
