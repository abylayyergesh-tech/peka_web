/** /shifts — касса: смены и их чеки.
 *
 * Раньше это были две страницы, но чек живёт внутри смены и без неё не имеет
 * смысла: выручка, наличность и Z-отчёт считаются по смене, а чек — её строка.
 * Поэтому одна страница с вкладками; вкладка чеков понимает ?shift=N, так что
 * ссылка «Чеки смены» из отчёта по смене ведёт сюда с уже наложенным фильтром.
 */
import { Tabs } from "antd";

import { useTabParam } from "@/components/useTabParam";
import ChecksTab from "@/pages/sales/ChecksTab";
import ShiftsTab from "@/pages/sales/ShiftsTab";

const TABS = ["shifts", "checks"] as const;

export default function ShiftsPage() {
  const [tab, setTab] = useTabParam("shifts", TABS);

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>Касса</h2>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "shifts", label: "Смены", children: <ShiftsTab /> },
          { key: "checks", label: "Чеки", children: <ChecksTab /> },
        ]}
      />
    </div>
  );
}
