/** /requests — управление (cap request.approve): все заявления, фильтры,
 * детали + история согласований, решения approve/reject, выплата аванса
 * (POST /pay гейтится на бэкенде правом finance.manage, не request.approve).
 *
 * Согласование идёт по стадиям маршрута: кнопки решения показываются только
 * когда бэкенд вернул can_decide = true (текущая стадия адресована этому
 * пользователю лично или его роли). Финальная стадия применяет эффект
 * заявления и регистрирует перевод в реестре выплат. */
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, DatePicker, Divider, Drawer, Form, Input, InputNumber,
  Modal, Popconfirm, Select, Space, Spin, Table, Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  approveRequest, getRequest, listActiveExpenseCategories, listRequests,
  payRequest, rejectRequest,
  type AdvancePayIn, type PaymentMethod, type RequestOut, type RequestStatus,
  type RequestType,
} from "@/api/requests";
import { useCan } from "@/auth/store";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import SubmitForEmployeeModal from "@/pages/requests/SubmitForEmployeeModal";
import {
  ApprovalSteps, ApprovalsList, describeRequest, REQUEST_STATUS_OPTIONS,
  REQUEST_TYPE_OPTIONS, RequestDetails, RequestStatusTags, RequestTypeTag,
  TimesheetCorrectionLines,
} from "@/pages/requests/shared";

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "bank", label: "Банковский перевод" },
  { value: "other", label: "Другое" },
];

interface PayFormValues {
  category_id: number;
  expense_date?: Dayjs;
  amount?: number;
  payment_method?: PaymentMethod;
}

export default function AllRequestsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canApprove = useCan("request.approve");
  const canPay = useCan("finance.manage");
  const canSubmitAny = useCan("request.submit_any");
  const [submitForOpen, setSubmitForOpen] = useState(false);
  const { limit, offset, tablePagination, reset } = usePagination();
  const [typeFilter, setTypeFilter] = useState<RequestType | undefined>();
  const [statusFilter, setStatusFilter] = useState<RequestStatus | undefined>();
  const [period, setPeriod] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm] = Form.useForm<PayFormValues>();

  const from = period?.[0]?.format("YYYY-MM-DD");
  const to = period?.[1]?.format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["requests", { limit, offset, type: typeFilter, status: statusFilter, from, to }],
    queryFn: () =>
      listRequests({ limit, offset, type: typeFilter, status: statusFilter, from, to }),
  });

  const detail = useQuery({
    queryKey: ["request", detailId],
    queryFn: () => getRequest(detailId!),
    enabled: detailId != null,
  });

  const categories = useQuery({
    queryKey: ["expense-categories", { active: true }],
    queryFn: listActiveExpenseCategories,
    enabled: payModalOpen,
    staleTime: 60_000,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["requests"] });
    queryClient.invalidateQueries({ queryKey: ["request"] });
  }

  const decide = useMutation({
    mutationFn: ({ id, action, comment }: { id: number; action: "approve" | "reject"; comment: string }) =>
      action === "approve"
        ? approveRequest(id, { comment: comment.trim() || null })
        : rejectRequest(id, { comment: comment.trim() || null }),
    onSuccess: (data, { action }) => {
      if (action !== "approve") {
        message.success("Заявление отклонено");
      } else if (data.status === "approved") {
        // Последняя стадия пройдена: эффект применён, перевод зарегистрирован.
        message.success(
          data.payroll_payment_id != null
            ? "Согласовано, перевод зарегистрирован в реестре выплат"
            : "Заявление согласовано",
        );
      } else {
        message.success(`Стадия согласована, заявление ушло дальше по маршруту`);
      }
      setDecisionComment("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["payroll-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-loans"] });
      queryClient.invalidateQueries({ queryKey: ["timesheet-grid"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-compensations"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const pay = useMutation({
    mutationFn: ({ id, values }: { id: number; values: PayFormValues }) => {
      const body: AdvancePayIn = {
        category_id: values.category_id,
        expense_date: values.expense_date?.format("YYYY-MM-DD"),
        amount: values.amount != null ? String(values.amount) : undefined,
        payment_method: values.payment_method,
      };
      return payRequest(id, body);
    },
    onSuccess: () => {
      message.success("Расход по авансу создан в Финансах");
      setPayModalOpen(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openDetail(id: number) {
    setDecisionComment("");
    setDetailId(id);
  }

  function openPay(req: RequestOut) {
    payForm.resetFields();
    payForm.setFieldsValue({
      expense_date: dayjs(),
      amount: req.amount != null ? Number(req.amount) : undefined,
    });
    setPayModalOpen(true);
  }

  const columns: ColumnsType<RequestOut> = [
    {
      title: "Сотрудник",
      dataIndex: "employee_name",
      render: (_, row) => row.employee_name ?? `Сотрудник #${row.employee_id}`,
    },
    { title: "Тип", dataIndex: "type", width: 130, render: (t: RequestType) => <RequestTypeTag type={t} /> },
    { title: "Статус", key: "status", width: 200, render: (_, row) => <RequestStatusTags req={row} /> },
    { title: "Детали", key: "details", render: (_, row) => describeRequest(row) },
    { title: "Создано", dataIndex: "created_at", width: 140, render: fmtDateTime },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_, row) => <a onClick={() => openDetail(row.request_id)}>Открыть</a>,
    },
  ];

  const req = detail.data;
  // Отражение расходом — отдельный необязательный шаг: реестр выплат уже
  // заполнен финальной стадией согласования, здесь создаётся Expense.
  const payable =
    req != null && req.type === "advance" && req.status === "approved" && req.expense_id == null;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Все заявления</h2>
        {canSubmitAny && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setSubmitForOpen(true)}>
            Подать за сотрудника
          </Button>
        )}
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
        <DatePicker.RangePicker
          format="DD.MM.YYYY"
          value={period}
          onChange={(dates) => {
            setPeriod(dates);
            reset();
          }}
        />
      </Space>
      <Table
        rowKey="request_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />

      <Drawer
        title={req ? `Заявление #${req.request_id}` : "Заявление"}
        open={detailId != null}
        onClose={() => setDetailId(null)}
        width={640}
      >
        {detail.isPending ? (
          <Spin />
        ) : req ? (
          <>
            <RequestDetails req={req} showEmployee />
            <TimesheetCorrectionLines req={req} />
            <ApprovalSteps req={req} />
            <ApprovalsList req={req} />
            {canApprove && req.status === "pending" && !req.can_decide && (
              <>
                <Divider />
                <Alert
                  type="info"
                  showIcon
                  message="Решение сейчас не за вами"
                  description="Текущая стадия маршрута адресована другому согласующему — либо вы субъект этого заявления."
                />
              </>
            )}
            {canApprove && req.status === "pending" && req.can_decide && (
              <>
                <Divider />
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  Решение по стадии {req.current_step_no ?? "—"}
                  {req.current_step_title ? `: ${req.current_step_title}` : ""}
                </Typography.Title>
                {req.steps.find((s) => s.step_no === req.current_step_no)?.is_final && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Это финальная стадия"
                    description="После согласования заявление вступит в силу, а по денежным типам будет зарегистрирован перевод в реестре выплат."
                  />
                )}
                <Input.TextArea
                  rows={2}
                  maxLength={2000}
                  placeholder="Комментарий к решению (необязательно)"
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  style={{ marginBottom: 12 }}
                />
                <Space>
                  <Popconfirm
                    title="Согласовать стадию?"
                    okText="Согласовать"
                    cancelText="Отмена"
                    onConfirm={() =>
                      decide.mutate({ id: req.request_id, action: "approve", comment: decisionComment })
                    }
                  >
                    <Button type="primary" loading={decide.isPending}>
                      Согласовать
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title="Отклонить заявление?"
                    description="Один отказ переводит заявление в «Отклонено» окончательно."
                    okText="Отклонить"
                    cancelText="Отмена"
                    onConfirm={() =>
                      decide.mutate({ id: req.request_id, action: "reject", comment: decisionComment })
                    }
                  >
                    <Button danger loading={decide.isPending}>
                      Отклонить
                    </Button>
                  </Popconfirm>
                </Space>
              </>
            )}
            {payable && canPay && (
              <>
                <Divider />
                <Typography.Paragraph type="secondary">
                  Перевод уже зарегистрирован в реестре выплат. Отразить его ещё и
                  расходом по статье — необязательный шаг.
                </Typography.Paragraph>
                <Button onClick={() => openPay(req)}>Отразить расходом</Button>
              </>
            )}
          </>
        ) : null}
      </Drawer>

      <SubmitForEmployeeModal open={submitForOpen} onClose={() => setSubmitForOpen(false)} />

      <Modal
        title="Отразить аванс расходом"
        open={payModalOpen}
        onCancel={() => setPayModalOpen(false)}
        onOk={() => payForm.submit()}
        okText="Создать расход"
        cancelText="Отмена"
        confirmLoading={pay.isPending}
        destroyOnClose
      >
        <Form
          form={payForm}
          layout="vertical"
          onFinish={(values) => detailId != null && pay.mutate({ id: detailId, values })}
        >
          <Form.Item
            name="category_id"
            label="Статья расходов"
            rules={[{ required: true, message: "Выберите статью" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={categories.isPending}
              placeholder="Выберите статью"
              options={categories.data?.map((c) => ({ value: c.expense_category_id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="expense_date" label="Дата расхода">
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Сумма"
            tooltip="По умолчанию — сумма из заявления"
          >
            <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="payment_method" label="Способ оплаты">
            <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder="Не указан" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
