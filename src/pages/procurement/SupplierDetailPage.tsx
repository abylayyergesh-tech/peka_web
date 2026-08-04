/** /suppliers/:id — supplier card with price list / payments / ledger tabs. */
import { Alert, Descriptions, Space, Spin, Tabs, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { errorMessage } from "@/api/client";
import { getSupplier, reportPayables } from "@/api/procurement";
import { useCan } from "@/auth/store";
import { Money, fmtDateTime } from "@/components/format";
import SupplierLedgerTab from "@/pages/procurement/SupplierLedgerTab";
import SupplierPaymentsTab from "@/pages/procurement/SupplierPaymentsTab";
import SupplierPricesTab from "@/pages/procurement/SupplierPricesTab";

/** Долг — красным, переплата — зелёным. */
function balanceColor(value: string | undefined): string | undefined {
  const n = Number(value ?? 0);
  return n > 0 ? "#cf1322" : n < 0 ? "#389e0d" : undefined;
}

export default function SupplierDetailPage() {
  const params = useParams();
  const supplierId = Number(params.id);
  const canReport = useCan("report.read");

  const query = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: Number.isFinite(supplierId),
  });

  // Счёт поставщика: получено / оплачено / разница. Тот же источник, что и отчёт
  // «Кредиторка», просто с фильтром по одному поставщику.
  const account = useQuery({
    queryKey: ["payables", { supplier: supplierId }],
    queryFn: () => reportPayables({ supplier: supplierId }),
    enabled: Number.isFinite(supplierId) && canReport,
  });
  const row = account.data?.[0];

  if (query.isPending) return <Spin style={{ display: "block", margin: "48px auto" }} />;
  if (query.isError) {
    return <Alert type="error" showIcon message={errorMessage(query.error)} />;
  }
  const supplier = query.data;

  return (
    <div>
      <Space style={{ marginBottom: 8 }} align="center">
        <h2 style={{ margin: 0 }}>{supplier.name}</h2>
        {supplier.is_active ? (
          <Tag color="green">Активен</Tag>
        ) : (
          <Tag color="red">Неактивен</Tag>
        )}
      </Space>
      <div style={{ marginBottom: 16 }}>
        <Link to="/suppliers">← К списку поставщиков</Link>
      </div>
      <Descriptions size="small" column={2} bordered style={{ marginBottom: 24 }}>
        <Descriptions.Item label="ИНН/БИН">{supplier.tax_id ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Телефон">{supplier.phone ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Email">{supplier.email ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Создан">{fmtDateTime(supplier.created_at)}</Descriptions.Item>
        <Descriptions.Item label="Получено (дебет)">
          {canReport ? <Money value={row?.total_received} /> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Оплачено (кредит)">
          {canReport ? <Money value={row?.total_paid} /> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Разница (долг)" span={2}>
          {canReport ? (
            <b style={{ color: balanceColor(row?.balance) }}>
              <Money value={row?.balance} />
            </b>
          ) : (
            "—"
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Примечание" span={2}>
          {supplier.note ?? "—"}
        </Descriptions.Item>
      </Descriptions>
      <Tabs
        defaultActiveKey="prices"
        items={[
          {
            key: "prices",
            label: "Прайс-лист",
            children: <SupplierPricesTab supplierId={supplierId} />,
          },
          {
            key: "payments",
            label: "Платежи",
            children: <SupplierPaymentsTab supplierId={supplierId} />,
          },
          ...(canReport
            ? [
                {
                  key: "ledger",
                  label: "Взаиморасчёты",
                  children: <SupplierLedgerTab supplierId={supplierId} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
