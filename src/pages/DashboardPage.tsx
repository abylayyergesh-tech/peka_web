import { Card, Col, Row, Typography } from "antd";
import { Link } from "react-router-dom";

import { useAuthStore } from "@/auth/store";
import { visibleSections } from "@/layout/menu";

export default function DashboardPage() {
  const { me, activeOrgId, caps } = useAuthStore();
  const org = me?.organizations.find((o) => o.id === activeOrgId);
  const sections = visibleSections(caps);

  return (
    <div>
      <Typography.Title level={3}>
        {org ? org.name : "Peka RSM"}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Здравствуйте, {me?.full_name}! Выберите раздел:
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {sections.map((s) => (
          <Col key={s.key} xs={24} sm={12} lg={8} xl={6}>
            <Card title={s.label} size="small">
              {s.items.map((i) => (
                <div key={i.path} style={{ marginBottom: 4 }}>
                  <Link to={i.path}>{i.label}</Link>
                </div>
              ))}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
