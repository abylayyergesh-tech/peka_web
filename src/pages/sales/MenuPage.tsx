/** /menu-items — меню: позиции и прайс-листы.
 *
 * Были две страницы, но это две стороны одной вещи: позиция несёт базовую цену,
 * прайс-лист — только отклонения от неё, и понять «сколько стоит» можно лишь
 * глядя на обе. Прайс конкретного меню остаётся отдельной страницей /menus/:id —
 * это редактор на 500 строк, во вкладку он не помещается.
 * Старый адрес /menus ведёт сюда, на вкладку прайс-листов.
 */
import { Tabs } from "antd";

import { useTabParam } from "@/components/useTabParam";
import MenuItemsTab from "@/pages/sales/MenuItemsTab";
import PriceListsTab from "@/pages/sales/PriceListsTab";

export const PRICE_LISTS_TAB = "/menu-items?tab=price-lists";

const TABS = ["items", "price-lists"] as const;

export default function MenuPage() {
  const [tab, setTab] = useTabParam("items", TABS);

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>Меню</h2>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "items", label: "Позиции", children: <MenuItemsTab /> },
          { key: "price-lists", label: "Прайс-листы", children: <PriceListsTab /> },
        ]}
      />
    </div>
  );
}
