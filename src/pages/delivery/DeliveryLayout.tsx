/** Каркас раздела развозки: маршруты собирают отдельно от курьеров и журнала. */
import { Segmented } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const TABS = [
  { value: "/delivery", label: "Маршруты" },
  { value: "/delivery/couriers", label: "Курьеры" },
  { value: "/delivery/logs", label: "Журнал" },
];

export default function DeliveryLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active =
    TABS.find((t) => pathname === t.value)?.value ?? "/delivery";

  return (
    <div>
      <Segmented
        value={active}
        onChange={(v) => navigate(String(v))}
        options={TABS}
        style={{ marginBottom: 16 }}
      />
      <Outlet />
    </div>
  );
}
