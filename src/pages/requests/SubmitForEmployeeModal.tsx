/** Подача заявления ЗА сотрудника (cap request.submit_any).
 *
 * Здесь живут типы, которые сотрудник сам за себя подать не может:
 *   * «Приём в штат» — кандидата ещё нет в справочнике, поэтому заявление
 *     подаётся от имени заявителя, а карточка сотрудника и карточка оплаты
 *     создаются автоматически после подтверждения HR;
 *   * «Перерасчёт табеля» — нужен выбор табеля и построчная правка дней.
 * Остальные типы тоже доступны: HR часто оформляет аванс или займ за человека. */
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAllPages, errorMessage } from "@/api/client";
import { listLegalEntities, listTimesheets } from "@/api/payroll";
import {
  submitRequestFor,
  type RequestCreate,
  type RequestType,
} from "@/api/requests";
import { getScheduleSwapPreview, listDepartments, listEmployees } from "@/api/staff";
import { PAY_TYPE_OPTIONS, periodLabel } from "@/pages/payroll/shared";
import { REQUEST_TYPE_LABELS } from "@/pages/requests/shared";

/** Строка правки табеля в форме перерасчёта. */
interface CorrectionRow {
  key: string;
  day: number;
  shifts: number;
}

let rowSeq = 0;

interface FormValues {
  employee_id: number;
  type: RequestType;
  amount?: number;
  period?: [Dayjs, Dayjs];
  is_paid?: boolean;
  last_working_day?: Dayjs;
  effective_date?: Dayjs;
  counterpart_employee_id?: number;
  term_months?: number;
  monthly_amount?: number;
  timesheet_id?: number;
  candidate_full_name?: string;
  candidate_position?: string;
  candidate_phone?: string;
  candidate_department_id?: number;
  candidate_pay_type?: "shift" | "salary";
  candidate_rate_amount?: number;
  candidate_official_amount?: number;
  candidate_legal_entity_id?: number;
  hire_date?: Dayjs;
  comment?: string;
}

const TYPE_OPTIONS = (Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((value) => ({
  value,
  label: REQUEST_TYPE_LABELS[value],
}));

export default function SubmitForEmployeeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const selectedType = Form.useWatch("type", form);
  const giverId = Form.useWatch("employee_id", form);
  const swapDate = Form.useWatch("effective_date", form);
  const [rows, setRows] = useState<CorrectionRow[]>([]);

  const employees = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => fetchAllPages((p) => listEmployees({ ...p, status: "active" })),
    staleTime: 60_000,
    enabled: open,
  });

  const departments = useQuery({
    queryKey: ["departments-options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
    enabled: open,
  });

  const entities = useQuery({
    queryKey: ["legal-entities"],
    queryFn: () => listLegalEntities(),
    staleTime: 60_000,
    enabled: open,
  });

  const timesheets = useQuery({
    queryKey: ["timesheets"],
    queryFn: () => listTimesheets({ limit: 100, offset: 0 }),
    staleTime: 60_000,
    enabled: open,
  });

  const swapPreview = useQuery({
    queryKey: [
      "schedule-swap-preview",
      giverId,
      swapDate ? swapDate.format("YYYY-MM-DD") : null,
    ],
    queryFn: () =>
      getScheduleSwapPreview({
        employee_id: giverId!,
        work_date: swapDate!.format("YYYY-MM-DD"),
      }),
    enabled: open && selectedType === "schedule" && giverId != null && swapDate != null,
  });

  function toBody(v: FormValues): RequestCreate {
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
          amount: v.is_paid && v.amount != null ? String(v.amount) : null,
          comment,
        };
      case "sick_leave":
        return {
          type: "sick_leave",
          start_date: v.period![0].format("YYYY-MM-DD"),
          end_date: v.period![1].format("YYYY-MM-DD"),
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
          counterpart_employee_id: v.counterpart_employee_id!,
          comment,
        };
      case "loan":
        return {
          type: "loan",
          amount: String(v.amount),
          term_months: v.term_months!,
          monthly_amount: v.monthly_amount != null ? String(v.monthly_amount) : null,
          comment,
        };
      case "timesheet_correction":
        return {
          type: "timesheet_correction",
          timesheet_id: v.timesheet_id!,
          days: rows.map((r) => ({ day: r.day, shifts: String(r.shifts) })),
          comment,
        };
      case "hiring":
        return {
          type: "hiring",
          candidate_full_name: v.candidate_full_name!,
          candidate_position: v.candidate_position || null,
          candidate_phone: v.candidate_phone || null,
          candidate_department_id: v.candidate_department_id ?? null,
          candidate_pay_type: v.candidate_pay_type ?? null,
          candidate_rate_amount:
            v.candidate_rate_amount != null ? String(v.candidate_rate_amount) : null,
          candidate_official_amount:
            v.candidate_official_amount != null ? String(v.candidate_official_amount) : null,
          candidate_legal_entity_id: v.candidate_legal_entity_id ?? null,
          hire_date: v.hire_date ? v.hire_date.format("YYYY-MM-DD") : null,
          comment,
        };
    }
  }

  const submit = useMutation({
    mutationFn: (values: FormValues) =>
      submitRequestFor({ employee_id: values.employee_id, request: toBody(values) }),
    onSuccess: () => {
      message.success("Заявление подано");
      form.resetFields();
      setRows([]);
      onClose();
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const correctionColumns: ColumnsType<CorrectionRow> = [
    {
      title: "День месяца",
      key: "day",
      width: 140,
      render: (_, row, index) => (
        <InputNumber
          size="small"
          min={1}
          max={31}
          value={row.day}
          onChange={(v) =>
            setRows((prev) => prev.map((r, i) => (i === index ? { ...r, day: v ?? 1 } : r)))
          }
        />
      ),
    },
    {
      title: "Смен должно быть",
      key: "shifts",
      width: 160,
      render: (_, row, index) => (
        <InputNumber
          size="small"
          min={0}
          max={3}
          step={0.5}
          value={row.shifts}
          onChange={(v) =>
            setRows((prev) => prev.map((r, i) => (i === index ? { ...r, shifts: v ?? 0 } : r)))
          }
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_, __, index) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
        />
      ),
    },
  ];

  return (
    <Modal
      title="Подать заявление за сотрудника"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Подать"
      cancelText="Отмена"
      width={640}
      confirmLoading={submit.isPending}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => {
          if (v.type === "timesheet_correction" && rows.length === 0) {
            message.error("Добавьте хотя бы один день");
            return;
          }
          submit.mutate(v);
        }}
      >
        <Form.Item name="type" label="Тип заявления" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} placeholder="Выберите тип" />
        </Form.Item>

        <Form.Item
          name="employee_id"
          label={selectedType === "hiring" ? "Заявитель (от кого заявление)" : "Сотрудник"}
          rules={[{ required: true }]}
          tooltip={
            selectedType === "hiring"
              ? "Кандидата ещё нет в справочнике — заявление подаётся от вашего имени"
              : undefined
          }
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={employees.isLoading}
            options={(employees.data ?? []).map((e) => ({
              value: e.employee_id,
              label: e.full_name,
            }))}
          />
        </Form.Item>

        {selectedType === "advance" && (
          <Form.Item name="amount" label="Сумма аванса" rules={[{ required: true }]}>
            <InputNumber min={1} step={10000} style={{ width: "100%" }} />
          </Form.Item>
        )}

        {selectedType === "sick_leave" && (
          <Form.Item
            name="period"
            label="Период больничного"
            rules={[{ required: true }]}
            extra="Дни отметятся в табеле буквой Б — вручную их дублировать не нужно"
          >
            <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
        )}

        {selectedType === "vacation" && (
          <>
            <Form.Item name="period" label="Период отпуска" rules={[{ required: true }]}>
              <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="is_paid" label="Оплата" initialValue rules={[{ required: true }]}>
              <Radio.Group
                options={[
                  { value: true, label: "Оплачиваемый" },
                  { value: false, label: "Без сохранения оплаты" },
                ]}
              />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(p, n) => p.is_paid !== n.is_paid}>
              {({ getFieldValue }) =>
                getFieldValue("is_paid") ? (
                  <Form.Item name="amount" label="Сумма отпускных">
                    <InputNumber min={1} step={10000} style={{ width: "100%" }} />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </>
        )}

        {selectedType === "resignation" && (
          <Form.Item
            name="last_working_day"
            label="Последний рабочий день"
            rules={[{ required: true }]}
          >
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
        )}

        {selectedType === "schedule" && (
          <>
            <Form.Item
              name="effective_date"
              label="Дата смены"
              rules={[{ required: true }]}
              extra="Отдающий должен быть в графике на работу в этот день"
            >
              <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>
            {swapPreview.data && !swapPreview.data.can_offer && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="В графике нет рабочей смены на эту дату"
                description="Сначала поставьте смену на странице «График», иначе заявление не примут."
              />
            )}
            <Form.Item
              name="counterpart_employee_id"
              label="Кто принимает смену"
              rules={[{ required: true, message: "Выберите коллегу" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={swapPreview.isFetching}
                placeholder={
                  swapPreview.data?.can_offer
                    ? "Свободные в этот день"
                    : "Сначала укажите дату и отдающего"
                }
                options={(swapPreview.data?.candidates ?? []).map((e) => ({
                  value: e.employee_id,
                  label: e.department_name ? `${e.full_name} · ${e.department_name}` : e.full_name,
                }))}
              />
            </Form.Item>
          </>
        )}

        {selectedType === "loan" && (
          <>
            <Form.Item name="amount" label="Сумма займа" rules={[{ required: true }]}>
              <InputNumber min={1} step={10000} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="term_months" label="Срок, месяцев" rules={[{ required: true }]}>
              <InputNumber min={1} max={120} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              name="monthly_amount"
              label="Ежемесячный платёж"
              tooltip="Пусто — график равными платежами, последний добьёт остаток"
            >
              <InputNumber min={1} step={10000} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}

        {selectedType === "timesheet_correction" && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Дни применятся к табелю только после подтверждения HR — в том числе если месяц уже закрыт."
            />
            <Form.Item name="timesheet_id" label="Табель (период)" rules={[{ required: true }]}>
              <Select
                options={(timesheets.data?.items ?? []).map((t) => ({
                  value: t.timesheet_id,
                  label: periodLabel(t.period_year, t.period_month),
                }))}
              />
            </Form.Item>
            <Table
              rowKey="key"
              size="small"
              dataSource={rows}
              columns={correctionColumns}
              pagination={false}
              locale={{ emptyText: "Дней нет — добавьте правку" }}
              style={{ marginBottom: 12 }}
            />
            <Button
              icon={<PlusOutlined />}
              onClick={() =>
                setRows((prev) => [...prev, { key: `r${(rowSeq += 1)}`, day: 1, shifts: 1 }])
              }
            >
              Добавить день
            </Button>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              «Смен должно быть» — итоговое значение клетки: 0 снимет смену, 0,5 — половина
              смены, 1 — полная.
            </Typography.Paragraph>
          </>
        )}

        {selectedType === "hiring" && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="После подтверждения HR карточка сотрудника и карточка оплаты создадутся автоматически. Доступ в приложение выдаётся отдельно приглашением."
            />
            <Form.Item
              name="candidate_full_name"
              label="ФИО кандидата"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="candidate_position" label="Должность">
              <Input />
            </Form.Item>
            <Form.Item name="candidate_phone" label="Телефон">
              <Input />
            </Form.Item>
            <Form.Item name="candidate_department_id" label="Цех">
              <Select
                allowClear
                options={(departments.data?.items ?? []).map((d) => ({
                  value: d.department_id,
                  label: d.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="candidate_pay_type" label="Тип оплаты">
              <Select allowClear options={PAY_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(p, n) => p.candidate_pay_type !== n.candidate_pay_type}>
              {({ getFieldValue }) =>
                getFieldValue("candidate_pay_type") ? (
                  <>
                    <Form.Item
                      name="candidate_rate_amount"
                      label={
                        getFieldValue("candidate_pay_type") === "shift"
                          ? "Ставка за смену, ₸"
                          : "Оклад за месяц, ₸"
                      }
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={0} step={1000} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item
                      name="candidate_official_amount"
                      label="в т.ч. официальная часть (месяц), ₸"
                    >
                      <InputNumber min={0} step={1000} style={{ width: "100%" }} />
                    </Form.Item>
                  </>
                ) : null
              }
            </Form.Item>
            <Form.Item name="candidate_legal_entity_id" label="Оформление (юрлицо)">
              <Select
                allowClear
                options={(entities.data ?? []).map((e) => ({
                  value: e.legal_entity_id,
                  label: e.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="hire_date" label="Дата приёма">
              <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}

        <Form.Item name="comment" label="Комментарий">
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
