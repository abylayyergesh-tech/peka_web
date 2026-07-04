import { LockOutlined } from "@ant-design/icons";
import { App, Button, DatePicker, Form, Modal, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  closePeriod,
  listPeriods,
  reopenPeriod,
  type AccountingPeriodOut,
} from "@/api/finance";
import { useCan } from "@/auth/store";
import { fmtDateTime } from "@/components/format";
import { monthLabel } from "@/pages/finance/labels";

interface CloseFormValues {
  period: Dayjs;
}

export default function AccountingPeriodsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("finance.manage");
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<CloseFormValues>();

  const query = useQuery({
    queryKey: ["accounting-periods"],
    queryFn: () => listPeriods(),
  });

  const close = useMutation({
    mutationFn: (values: CloseFormValues) =>
      closePeriod({ year: values.period.year(), month: values.period.month() + 1 }),
    onSuccess: () => {
      message.success("Период закрыт");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["accounting-periods"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const reopen = useMutation({
    mutationFn: (p: AccountingPeriodOut) => reopenPeriod({ year: p.year, month: p.month }),
    onSuccess: () => {
      message.success("Период переоткрыт");
      queryClient.invalidateQueries({ queryKey: ["accounting-periods"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openClose() {
    form.resetFields();
    setModalOpen(true);
  }

  const columns: ColumnsType<AccountingPeriodOut> = [
    { title: "Период", render: (_, p) => monthLabel(p.year, p.month) },
    { title: "Год", dataIndex: "year", width: 90 },
    { title: "Месяц", dataIndex: "month", width: 90 },
    {
      title: "Статус",
      dataIndex: "status",
      width: 120,
      render: (s: string) =>
        s === "closed" ? <Tag color="red">Закрыт</Tag> : <Tag color="green">Открыт</Tag>,
    },
    {
      title: "Закрыт",
      dataIndex: "closed_at",
      width: 160,
      render: (v: string | null) => fmtDateTime(v),
    },
    {
      title: "",
      width: 130,
      render: (_, p) =>
        canManage &&
        p.status === "closed" && (
          <Popconfirm
            title="Переоткрыть период?"
            description="Записи в этом месяце снова можно будет менять."
            okText="Да"
            cancelText="Нет"
            onConfirm={() => reopen.mutate(p)}
          >
            <a>Переоткрыть</a>
          </Popconfirm>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 8, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Учётные периоды</h2>
        {canManage && (
          <Button type="primary" icon={<LockOutlined />} onClick={openClose}>
            Закрыть период
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        В списке показаны только закрытые периоды. Открытые месяцы доступны для проводок
        и здесь не отображаются.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data}
        pagination={false}
        columns={columns}
      />
      <Modal
        title="Закрыть период"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Закрыть период"
        cancelText="Отмена"
        confirmLoading={close.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => close.mutate(v)}>
          <Form.Item
            name="period"
            label="Месяц"
            rules={[{ required: true, message: "Выберите месяц" }]}
          >
            <DatePicker picker="month" format="MMMM YYYY" style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
