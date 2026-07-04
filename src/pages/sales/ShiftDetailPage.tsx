/** /shifts/:id — shift report: shift info, sales totals, payment breakdown. */
import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  App, Button, Card, Col, Descriptions, Popconfirm, Result, Row, Space, Spin, Statistic,
} from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { closeShift, getShift, listWarehousesLookup } from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money, fmtDateTime, fmtMoney } from "@/components/format";
import { ShiftStatusTag, paymentMethodLabel } from "@/pages/sales/statusTags";

export default function ShiftDetailPage() {
  const { id } = useParams();
  const shiftId = Number(id);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canOperate = useCan("sale.operate");

  const query = useQuery({
    queryKey: ["shift", shiftId],
    queryFn: () => getShift(shiftId),
    enabled: Number.isFinite(shiftId),
  });

  const warehouses = useQuery({
    queryKey: ["warehouses-lookup"],
    queryFn: listWarehousesLookup,
    staleTime: 60_000,
  });

  const doClose = useMutation({
    mutationFn: () => closeShift(shiftId),
    onSuccess: () => {
      message.success("Смена закрыта");
      queryClient.invalidateQueries({ queryKey: ["shift", shiftId] });
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (query.isPending) return <Spin style={{ display: "block", margin: "48px auto" }} />;
  if (query.isError) {
    return <Result status="error" title="Смена не найдена" subTitle={errorMessage(query.error)} />;
  }

  const { shift, totals } = query.data;
  const warehouseName =
    warehouses.data?.items.find((w) => w.id === shift.warehouse_id)?.name ??
    `#${shift.warehouse_id}`;
  const methods = Object.entries(totals.by_method);

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/shifts")}>
            К сменам
          </Button>
          <h2 style={{ margin: 0 }}>
            Смена №{shift.number ?? shift.id} <ShiftStatusTag status={shift.status} />
          </h2>
        </Space>
        <Space>
          <Link to={`/checks?shift=${shift.id}`}>
            <Button>Чеки смены</Button>
          </Link>
          {canOperate && shift.status === "open" && (
            <Popconfirm
              title="Закрыть смену?"
              description="Все чеки смены должны быть закрыты или аннулированы."
              okText="Закрыть"
              cancelText="Отмена"
              onConfirm={() => doClose.mutate()}
            >
              <Button danger loading={doClose.isPending}>
                Закрыть смену
              </Button>
            </Popconfirm>
          )}
        </Space>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Склад">{warehouseName}</Descriptions.Item>
          <Descriptions.Item label="Открыта">{fmtDateTime(shift.opened_at)}</Descriptions.Item>
          <Descriptions.Item label="Закрыта">{fmtDateTime(shift.closed_at)}</Descriptions.Item>
          <Descriptions.Item label="Разменный фонд">
            <Money value={shift.opening_float} />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="Чеков" value={totals.check_count} />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card size="small">
            <Statistic title="Продажи (до скидок)" value={fmtMoney(totals.gross)} />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card size="small">
            <Statistic title="Скидки" value={fmtMoney(totals.discount_total)} />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card size="small">
            <Statistic title="Выручка" value={fmtMoney(totals.revenue)} />
          </Card>
        </Col>
        <Col xs={12} md={5}>
          <Card size="small">
            <Statistic title="Наличные в кассе (расчёт)" value={fmtMoney(totals.expected_cash)} />
          </Card>
        </Col>
      </Row>

      <Card title="Оплаты по способам" size="small">
        {methods.length === 0 ? (
          <span>Оплат нет</span>
        ) : (
          <Descriptions size="small" column={1} style={{ maxWidth: 360 }}>
            {methods.map(([method, amount]) => (
              <Descriptions.Item key={method} label={paymentMethodLabel(method)}>
                <Money value={amount} />
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Card>
    </div>
  );
}
