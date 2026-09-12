/** Вкладки журнала заявлений и бланков — один экран, два адреса. */
import { Tabs } from "antd";
import { useNavigate } from "react-router-dom";

export default function RequestsSectionTabs({
  active,
}: {
  active: "list" | "templates";
}) {
  const navigate = useNavigate();
  return (
    <Tabs
      activeKey={active}
      onChange={(key) =>
        navigate(key === "templates" ? "/requests/templates" : "/requests")
      }
      items={[
        { key: "list", label: "Заявления" },
        { key: "templates", label: "Шаблоны" },
      ]}
    />
  );
}