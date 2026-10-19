/** Вкладки раздела заявлений: журнал, бланки и типы — один экран, три адреса. */
import { Tabs } from "antd";
import { useNavigate } from "react-router-dom";

export default function RequestsSectionTabs({
  active,
}: {
  active: "list" | "templates" | "types";
}) {
  const navigate = useNavigate();
  return (
    <Tabs
      activeKey={active}
      onChange={(key) =>
        navigate(key === "templates" ? "/requests/templates" : key === "types" ? "/requests/types" : "/requests")
      }
      items={[
        { key: "list", label: "Заявления" },
        { key: "templates", label: "Шаблоны" },
        { key: "types", label: "Типы" },
      ]}
    />
  );
}