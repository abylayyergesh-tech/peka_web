/** /reports/payables — кредиторка по поставщикам (право report.read).
 *
 *  Фильтр «юр. лицо» отвечает на вопрос «чей это долг»: у бизнеса два ИП, и за
 *  долг перед поставщиком отвечает конкретное из них. Значение живёт в адресе, а
 *  не в состоянии: на этот экран проваливаются ссылкой из «Денег по юр. лицам»,
 *  и такую ссылку должно быть можно переслать или сохранить в закладки. */
import { Alert, DatePicker, Select, Space, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { errorMessage } from "@/api/client";
import { reportPayables, type SupplierBalanceOut } from "@/api/procurement";
import { Money } from "@/components/format";
import {
  entityFilterOptions,
  entityName,
  useCompanyEntities,
} from "@/pages/finance/companyEntities";
import { useSupplierRefs } from "@/pages/procurement/refData";

export default function PayablesReportPage() {
  const [asOf, setAsOf] = useState<Dayjs | null>(null);
  const [supplier, setSupplier] = useState<number | undefined>(undefined);
  const suppliers = useSupplierRefs();
  const asOfStr = asOf ? asOf.format("YYYY-MM-DD") : undefined;
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

  const columns: ColumnsType<SupplierBalanceOut> = [
    {
      title: "Поставщик",
      dataIndex: "supplier_name",
      render: (_, row) => <Link to={`/suppliers/${row.supplier_id}`}>{row.supplier_name}</Link>,
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
        // Долг красным, переплата зелёным: иначе минус в длинном списке не заметен.
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
      <Space style={{ marginBottom: 16 }} wrap>
        <h2 style={{ margin: 0 }}>Кредиторка</h2>
        <DatePicker
          placeholder="На дату"
          format="DD.MM.YYYY"
          value={asOf}
          onChange={(v) => setAsOf(v)}
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
        dataSource={query.data}
        pagination={false}
        columns={columns}
        summary={(rows) => {
          const sum = (pick: (r: SupplierBalanceOut) => string) =>
            rows.reduce((acc, r) => acc + Number(pick(r)), 0);
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Итого</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <b>
                  <Money value={sum((r) => r.total_received)} />
                </b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                <b>
                  <Money value={sum((r) => r.total_paid)} />
                </b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
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
