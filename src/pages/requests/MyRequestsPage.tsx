/** /my/requests — self-service: подать заявление, список своих, отмена pending. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App, Button, DatePicker, Drawer, Form, Input, InputNumber, Modal, Popconfirm,
  Radio, Select, Space, Spin, Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  cancelMyRequest, getMyRequest, listMyRequests, submitRequest,
  type RequestCreate, type RequestOut, type RequestStatus, type RequestType,
} from "@/api/requests";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  ApprovalsList, describeRequest, REQUEST_STATUS_OPTIONS, REQUEST_TYPE_OPTIONS,
  RequestDetails, RequestStatusTags, RequestTypeTag,
} from "@/pages/requests/shared";

interface SubmitFormValues {
  type: RequestType;
  amount?: number;
  period?: [Dayjs, Dayjs];
  is_paid?: boolean;
  last_working_day?: Dayjs;
  effective_date?: Dayjs;
  comment?: string;
}

function toCreateBody(v: SubmitFormValues): RequestCreate {
  const comment = v.comment?.trim() ? v.comment.trim() : null;
  switch (v.type) {
    case "advance":
      return { type: "advance", amount: String(v.amount), comment };
    case "vacation":
      return {
        type: "vacation",
        start_date: v.period![0].format("YYYY-MM-DD"),
        end_date: v.period![1].format("YYYY-MM-DD"),
        is_paid: v.is_paid!,
        comment,
      };
    case "resignation":
      return {
        type: "resignation",
        last_working_day: v.last_working_day!.format("YYYY-MM-DD"),
        comment,
      };
    case "schedule":
      return {
        type: "schedule",
        effective_date: v.effective_date!.format("YYYY-MM-DD"),
        comment,
      };
  }
}

export default function MyRequestsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { limit, offset, tablePagination, reset } = usePagination();
  const [typeFilter, setTypeFilter] = useState<RequestType | undefined>();
  const [statusFilter, setStatusFilter] = useState<RequestStatus | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form] = Form.useForm<SubmitFormValues>();
  const selectedType = Form.useWatch("type", form);

  const query = useQuery({
    queryKey: ["my-requests", { limit, offset, type: typeFilter, status: statusFilter }],
    queryFn: () => listMyRequests({ limit, offset, type: typeFilter, status: statusFilter }),
  });

  const detail = useQuery({
    queryKey: ["my-request", detailId],
    queryFn: () => getMyRequest(detailId!),
    enabled: detailId != null,
  });

  const submit = useMutation({
    mutationFn: (values: SubmitFormValues) => submitRequest(toCreateBody(values)),
    onSuccess: () => {
      message.success("Заявление подано");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["my-requests"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => cancelMyRequest(id),
    onSuccess: () => {
      message.success("Заявление отменено");
      queryClient.invalidateQueries({ queryKey: ["my-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-request"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openSubmit() {
    form.resetFields();
    setModalOpen(true);
  }

  const columns: ColumnsType<RequestOut> = [
    { title: "Тип", dataIndex: "type", width: 130, render: (t: RequestType) => <RequestTypeTag type={t} /> },
    { title: "Статус", key: "status", width: 200, render: (_, row) => <RequestStatusTags req={row} /> },
    { title: "Детали", key: "details", render: (_, row) => describeRequest(row) },
    { title: "Создано", dataIndex: "created_at", width: 140, render: fmtDateTime },
    {
      title: "",
      key: "actions",
      width: 170,
      render: (_, row) => (
        <Space>
          <a onClick={() => setDetailId(row.id)}>Подробнее</a>
          {row.status === "pending" && (
            <Popconfirm
              title="Отменить заявление?"
              description="Отменённое заявление нельзя вернуть — придётся подать новое."
              okText="Отменить заявление"
              cancelText="Нет"
              onConfirm={() => cancel.mutate(row.id)}
            >
              <a>Отменить</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Мои заявления</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openSubmit}>
          Подать заявление
        </Button>
      </Space>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          placeholder="Тип"
          style={{ width: 170 }}
          options={REQUEST_TYPE_OPTIONS}
          value={typeFilter}
          onChange={(v?: RequestType) => {
            setTypeFilter(v);
            reset();
          }}
        />
        <Select
          allowClear
          placeholder="Статус"
          style={{ width: 190 }}
          options={REQUEST_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v?: RequestStatus) => {
            setStatusFilter(v);
            reset();
          }}
        />
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />

      <Modal
        title="Новое заявление"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Подать"
        cancelText="Отмена"
        confirmLoading={submit.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => submit.mutate(v)}>
          <Form.Item
            name="type"
            label="Тип заявления"
            rules={[{ required: true, message: "Выберите тип" }]}
          >
            <Select options={REQUEST_TYPE_OPTIONS} placeholder="Выберите тип" />
          </Form.Item>
          {selectedType === "advance" && (
            <Form.Item
              name="amount"
              label="Сумма аванса"
              rules={[{ required: true, message: "Укажите сумму" }]}
            >
              <InputNumber min={0.01} precision={2} style={{ width: "100%" }} placeholder="0.00" />
            </Form.Item>
          )}
          {selectedType === "vacation" && (
            <>
              <Form.Item
                name="period"
                label="Период отпуска"
                rules={[{ required: true, message: "Укажите даты" }]}
              >
                <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                name="is_paid"
                label="Оплата"
                initialValue={true}
                rules={[{ required: true, message: "Выберите вариант" }]}
              >
                <Radio.Group
                  options={[
                    { value: true, label: "Оплачиваемый" },
                    { value: false, label: "Без сохранения оплаты" },
                  ]}
                />
              </Form.Item>
            </>
          )}
          {selectedType === "resignation" && (
            <Form.Item
              name="last_working_day"
              label="Последний рабочий день"
              rules={[{ required: true, message: "Укажите дату" }]}
            >
              <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>
          )}
          {selectedType === "schedule" && (
            <Form.Item
              name="effective_date"
              label="Дата вступления в силу"
              rules={[{ required: true, message: "Укажите дату" }]}
            >
              <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item
            name="comment"
            label="Комментарий"
            tooltip="Для графика опишите желаемый график, для увольнения — причину"
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail.data ? `Заявление #${detail.data.id}` : "Заявление"}
        open={detailId != null}
        onClose={() => setDetailId(null)}
        width={560}
      >
        {detail.isPending ? (
          <Spin />
        ) : detail.data ? (
          <>
            <RequestDetails req={detail.data} />
            <ApprovalsList req={detail.data} />
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
