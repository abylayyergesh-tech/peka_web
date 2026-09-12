import { Typography } from "antd";
import { Link } from "react-router-dom";

import { useAuthStore } from "@/auth/store";
import { visibleSections } from "@/layout/menu";

export default function DashboardPage() {
  const { me, activeOrgId, caps } = useAuthStore();
  const org = me?.organizations.find((o) => o.organization_id === activeOrgId);
  const sections = visibleSections(caps);

  return (
    <div>
      <p className="page-kicker">Рабочее место</p>
      <h1 className="page-title">{org ? org.name : "Peka RSM"}</h1>
      <p className="page-lead">
        Здравствуйте, {me?.full_name}. Наведите на карточку — она загорится.
        Нажмите — откроется раздел.
      </p>
      {sections.map((s) => (
        <section key={s.key} className="dash-group">
          <h2 className="dash-group-title">{s.label}</h2>
          <div className="dash-grid">
            {s.items.map((i) => (
              <Link key={i.path} to={i.path} className="dash-tile">
                <span>{i.label}</span>
                <span className="dash-tile-go" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {sections.length === 0 && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 24 }}>
          Нет доступных разделов.
        </Typography.Paragraph>
      )}
    </div>
  );
}
