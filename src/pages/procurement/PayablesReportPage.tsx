/** /reports/payables — кредиторка по поставщикам (право report.read).
 *
 *  Фильтр «юр. лицо» отвечает на вопрос «чей это долг»: у бизнеса два ИП, и за
 *  долг перед поставщиком отвечает конкретное из них. Значение живёт в адресе, а
 *  не в состоянии: на этот экран проваливаются ссылкой из «Денег по юр. лицам»,
 *  и такую ссылку должно быть можно переслать или сохранить в закладки.
 *
 *  Поиск — на клиенте: эндпоинт отдаёт весь список сразу. «По» — срез долга
 *  (as_of). «С» без «По» тоже ставит срез: в строке кредиторки нет дат
 *  проводок, оборот за период здесь считать нечем — он в акте сверки. */
import { SearchOutlined } from "@ant-design/icons";
import { Alert, DatePicker, Input, Select, Space, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { errorMessage } from "@/api/client";
import { reportPayables, type SupplierBalanceOut } from "@/api/procurement";
import { Money } from "@/components/format";
import {
  EntityTag,
  entityFilterOptions,
  entityName,
  useCompanyEntities,
} from "@/pages/finance/companyEntities";
import { useSupplierRefs } from "@/pages/procurement/refData";

function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

export default function PayablesReportPage() {
  const [asOf, setAsOf] = useState<Dayjs | null>(null);
  const [fromDate, setFromDate] = useState<Dayjs | null>(null);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState<number | undefined>(undefined);
  const suppliers = useSupplierRefs();
  const cut = asOf ?? fromDate;
  const asOfStr = cut ? cut.format("YYYY-MM-DD") : undefined;
  const [params, setParams] = useSearchParams();
  const entityFilter = params.get("company_entity") ?? undefined;
  const entities = useCompanyEntities(true);

  const query = useQuery({
    queryKey: ["payables", {
      as_of: asOfStr ?? null, supplier: supplier ?? null,
      entity: entityFilter ?? null,
    }],
    queryFn: () =>
      reportPayables({ as_of: asOfStr, supplier, company_entity: entityFilter }),
  });

  const rows = useMemo(() => {
    const needle = normalize(search.trim());
    const all = query.data ?? [];
    return all.filter((r) => {
      if (!needle) return true;
      if (normalize(r.supplier_name).includes(needle)) return true;
      if (r.company_entities_mixed && "несколько".includes(needle)) return true;
      return normalize(entityName(entities.data, r.company_entity_id)).includes(needle);
    });
  }, [query.data, search, entities.data]);

  const columns: ColumnsType<SupplierBalanceOut> = [
    {
      title: "Поставщик",
      dataIndex: "supplier_name",
      render: (_, row) => (
        <Space size={8}>
          <Link to={`/suppliers/${row.supplier_id}`}>{row.supplier_name}</Link>
          <Link
            to={`/reports/supplier-reconciliation?supplier_id=${row.supplier_id}`}
            style={{ color: "#8c8c8c" }}
          >
            акт
          </Link>
        </Space>
      ),
    },
    {
      title: "Юр. лицо",
      dataIndex: "company_entity_id",
      width: 190,
      render: (id: number | null, row) => {
        if (row.company_entities_mixed) {
          return (
            <Tooltip title="Долг этого поставщика сидит на нескольких наших юр. лицах — режьте фильтром сверху">
              <Tag style={{ marginInlineEnd: 0 }}>несколько</Tag>
            </Tooltip>
          );
        }
        if (
          id == null &&
          Number(row.total_received) === 0 &&
          Number(row.total_paid) === 0
        ) {
          return <span style={{ color: "#bfbfbf" }}>—</span>;
        }
        return <EntityTag entities={entities.data} id={id} />;
      },
    },
    {
      title: "Получено (дебет)",
      dataIndex: "total_received",
      width: 180,
      align: "right",
      sorter: (a, b) => Number(a.total_received) - Number(b.total_received),
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Оплачено (кредит)",
      dataIndex: "total_paid",
      width: 180,
      align: "right",
      sorter: (a, b) => Number(a.total_paid) - Number(b.total_paid),
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Разница (долг)",
      dataIndex: "balance",
      width: 190,
      align: "right",
      defaultSortOrder: "descend",
      sorter: (a, b) => Number(a.balance) - Number(b.balance),
      render: (v: string) => {
        const n = Number(v);
        const color = n > 0 ? "#cf1322" : n < 0 ? "#389e0d" : undefined;
        return (
          <b style={{ color }}>
            <Money value={v} />
          </b>
        );
      },
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
        wrap
      >
        <h2 style={{ margin: 0 }}>Кредиторка</h2>
        <Space wrap>
          <Input
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по поставщику или юр. лицу"
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Поставщик"
            style={{ width: 220 }}
            value={supplier}
            onChange={(v) => setSupplier(v)}
            options={suppliers.options}
            loading={suppliers.isPending}
          />
          <Tooltip title="Чей это долг: у каждого нашего юр. лица своя кредиторка">
            <Select
              allowClear
              placeholder="Все юр. лица"
              style={{ width: 210 }}
              value={entityFilter}
              loading={entities.isPending}
              options={entityFilterOptions(entities.data)}
              onChange={(v) => {
                const next = new URLSearchParams(params);
                if (v) next.set("company_entity", v);
                else next.delete("company_entity");
                setParams(next, { replace: true });
              }}
            />
          </Tooltip>
          <Tooltip title="Срез долга на дату. Если «По» пусто — берётся «С». Оборот за период — в акте сверки.">
            <DatePicker
              placeholder="С"
              format="DD.MM.YYYY"
              value={fromDate}
              onChange={(v) => setFromDate(v)}
              allowClear
            />
          </Tooltip>
          <Tooltip title="Срез долга на дату">
            <DatePicker
              placeholder="По"
              format="DD.MM.YYYY"
              value={asOf}
              onChange={(v) => setAsOf(v)}
              allowClear
            />
          </Tooltip>
        </Space>
      </Space>
      {entityFilter && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            entityFilter === "none"
              ? "Показаны долги без юр. лица — записи, заведённые до разделения"
              : `Показаны долги за «${entityName(
                  entities.data,
                  Number(entityFilter),
                )}»`
          }
        />
      )}
      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={errorMessage(query.error)}
        />
      )}
      <Table
        rowKey="supplier_id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        pagination={{ pageSize: 20, showTotal: (t) => `Всего: ${t}` }}
        locale={{ emptyText: search ? "Поставщик не найден" : "Задолженностей нет" }}
        columns={columns}
        summary={(pageRows) => {
          const sum = (pick: (r: SupplierBalanceOut) => string) =>
            pageRows.reduce((acc, r) => acc + Number(pick(r)), 0);
          if (pageRows.length === 0) return null;
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}>
                <b>{search ? "Итого по найденным" : "Итого"}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                <b>
                  <Money value={sum((r) => r.total_received)} />
                </b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <b>
                  <Money value={sum((r) => r.total_paid)} />
                </b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <b>
                  <Money value={sum((r) => r.balance)} />
                </b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          );
        }}
      />
    </div>
  );
}
