/** /warehouses — склады: остатки и сам справочник складов.
 *
 * Раньше это были две страницы («Остатки на складах» и «Склады»), но говорят они
 * об одном: остатки без списка складов не читаются, а список складов без остатков
 * ничего не сообщает. Поэтому одна страница с вкладками; вкладка по умолчанию —
 * остатки, справочник нужен раз в полгода. Старый адрес /reports/stock ведёт сюда.
 */
import { Tabs } from "antd";

import { useTabParam } from "@/components/useTabParam";
import StockTab from "@/pages/inventory/StockTab";
import WarehouseListTab from "@/pages/inventory/WarehouseListTab";

const TABS = ["stock", "list"] as const;

export default function WarehousesPage() {
  const [tab, setTab] = useTabParam("stock", TABS);

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>Склады</h2>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "stock", label: "Остатки", children: <StockTab /> },
          { key: "list", label: "Список складов", children: <WarehouseListTab /> },
        ]}
      />
    </div>
  );
}
