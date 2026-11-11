import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Row, Space, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { fetchFinancialSummary } from "@/api/finance";
import Stat from "@/components/Stat";
import { ExcelExportButton } from "@/components/excel";

export default function FinancialSummaryPage() {
  const query = useQuery({
    queryKey: ["financial-summary"],
    queryFn: () => fetchFinancialSummary(),
  });

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Финансовая сводка</h2>
        <Space>
        <ExcelExportButton
          fileName="Финансовая сводка"
          disabled={!query.data}
          sheets={() => [{
            name: "Сводка",
            columns: [
              { title: "Показатель", value: (r: { k: string }) => r.k },
              { title: "Сумма", value: (r: { v: unknown }) => r.v },
            ],
            rows: [
              { k: "Кредиторская задолженность (мы должны поставщикам)", v: query.data?.ap_total },
              { k: "Дебиторская задолженность (нам должны клиенты)", v: query.data?.ar_total },
            ],
          }]}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => query.refetch()}
          loading={query.isFetching}
        >
          Обновить
        </Button>
        </Space>
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
            <Stat
              title="Кредиторская задолженность (мы должны поставщикам)"
              value={query.data?.ap_total}
              format="money"
              valueStyle={{ color: "#cf1322" }}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card loading={query.isPending}>
            <Stat
              title="Дебиторская задолженность (нам должны клиенты)"
              value={query.data?.ar_total}
              format="money"
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
