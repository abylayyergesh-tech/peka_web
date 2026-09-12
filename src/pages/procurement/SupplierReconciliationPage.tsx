/** /reports/supplier-reconciliation — акт сверки с поставщиком за период. */
import { Alert, Select, Space } from "antd";
import { useSearchParams } from "react-router-dom";

import { useReportRange } from "@/pages/finance/reportRange";
import { useSupplierRefs } from "@/pages/procurement/refData";
import SupplierReconciliationAct from "@/pages/procurement/SupplierReconciliationAct";

export default function SupplierReconciliationPage() {
  const [url, setUrl] = useSearchParams();
  const suppliers = useSupplierRefs();
  const { range, setRange } = useReportRange();
  const supplierId = Number(url.get("supplier_id")) || undefined;
  const entityFilter = url.get("company_entity") ?? undefined;

  return (
    <div>
      <h2 className="no-print" style={{ marginTop: 0 }}>
        Акт сверки с поставщиком
      </h2>
      <Space wrap className="no-print" style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Поставщик"
          style={{ width: 320 }}
          loading={suppliers.isPending}
          options={suppliers.options}
          value={supplierId}
          allowClear
          onChange={(v) => {
            const next = new URLSearchParams(url);
            if (v) next.set("supplier_id", String(v));
            else next.delete("supplier_id");
            setUrl(next, { replace: true });
          }}
        />
      </Space>

      {supplierId == null ? (
        <Alert
          className="no-print"
          type="info"
          showIcon
          message="Выберите поставщика — акт покажет сальдо, накладные и оплаты за период"
        />
      ) : (
        <SupplierReconciliationAct
          supplierId={supplierId}
          range={range}
          onRangeChange={setRange}
          entityFilter={entityFilter}
          onEntityFilterChange={(v) => {
            const next = new URLSearchParams(url);
            if (v) next.set("company_entity", v);
            else next.delete("company_entity");
            setUrl(next, { replace: true });
          }}
        />
      )}
    </div>
  );
}
