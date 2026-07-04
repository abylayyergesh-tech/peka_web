import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Row, Space, Statistic, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { fetchFinancialSummary } from "@/api/finance";
import { fmtMoney } from "@/components/format";

export default function FinancialSummaryPage() {
  const query = useQuery({
    queryKey: ["financial-summary"],
    queryFn: () => fetchFinancialSummary(),
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Финансовая сводка</h2>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => query.refetch()}
          loading={query.isFetching}
        >
          Обновить
        </Button>
      </Space>

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={errorMessage(query.error)}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card loading={query.isPending}>
            <Statistic
              title="Кредиторская задолженность (мы должны поставщикам)"
              value={query.data ? fmtMoney(query.data.ap_total) : "—"}
              valueStyle={{ color: "#cf1322" }}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card loading={query.isPending}>
            <Statistic
              title="Дебиторская задолженность (нам должны клиенты)"
              value={query.data ? fmtMoney(query.data.ar_total) : "—"}
              valueStyle={{ color: "#3f8600" }}
              prefix={<ArrowDownOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Кредиторка — сумма невыплаченных обязательств перед поставщиками, дебиторка —
        сумма непогашенной задолженности клиентов.
      </Typography.Paragraph>
    </div>
  );
}
