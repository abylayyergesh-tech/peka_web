/** /suppliers/:id — supplier card with price list / payments / ledger tabs. */
import { Alert, Descriptions, Space, Spin, Tabs, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { errorMessage } from "@/api/client";
import { getSupplier } from "@/api/procurement";
import { useCan } from "@/auth/store";
import { fmtDateTime } from "@/components/format";
import SupplierLedgerTab from "@/pages/procurement/SupplierLedgerTab";
import SupplierPaymentsTab from "@/pages/procurement/SupplierPaymentsTab";
import SupplierPricesTab from "@/pages/procurement/SupplierPricesTab";

export default function SupplierDetailPage() {
  const params = useParams();
  const supplierId = Number(params.id);
  const canReport = useCan("report.read");

  const query = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: Number.isFinite(supplierId),
  });

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
