/** Вкладка «Взаиморасчёты» на карточке поставщика — акт сверки за период. */
import { useState } from "react";

import { useReportRange } from "@/pages/finance/reportRange";
import SupplierReconciliationAct from "@/pages/procurement/SupplierReconciliationAct";

export default function SupplierLedgerTab({ supplierId }: { supplierId: number }) {
  const { range, setRange } = useReportRange();
  const [entityFilter, setEntityFilter] = useState<string | undefined>();

  return (
    <SupplierReconciliationAct
      supplierId={supplierId}
      range={range}
      onRangeChange={setRange}
      entityFilter={entityFilter}
      onEntityFilterChange={setEntityFilter}
    />
  );
}
