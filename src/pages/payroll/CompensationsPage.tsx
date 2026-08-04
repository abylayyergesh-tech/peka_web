/** Справочник ставок — лист «Сотрудники» рабочего шаблона: тип оплаты,
 * ставка/оклад, официальная часть, оформление, каспи. «Серая часть» и «доля
 * офиц.» считает бэкенд. */
import { EditOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  listCompensations,
  listLegalEntities,
  upsertCompensation,
  type CompensationOut,
  type PayType,
} from "@/api/payroll";
import { listDepartments } from "@/api/staff";
import { useCan } from "@/auth/store";
import { usePagination } from "@/components/usePagination";
import {
  LEGAL_KIND_LABELS,
  PAY_TYPE_LABELS,
  PAY_TYPE_OPTIONS,
  fmtShare,
  fmtTenge,
} from "@/pages/payroll/shared";

interface FormValues {
  pay_type: PayType;
  rate_amount: number;
  official_amount: number;
  legal_entity_id: number | null;
  kaspi_details?: string;
  note?: string;
}

export default function CompensationsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payroll.manage");
  const { limit, offset, tablePagination, reset } = usePagination(50);
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [payType, setPayType] = useState<PayType | undefined>();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CompensationOut | null>(null);
  const [form] = Form.useForm<FormValues>();

  const query = useQuery({
    queryKey: ["payroll-compensations", { limit, offset, departmentId, payType, search }],
    queryFn: () =>
      listCompensations({
        limit,
        offset,
        department_id: departmentId,
        pay_type: payType,
        q: search || undefined,
      }),
  });

  const departments = useQuery({
    queryKey: ["departments-options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });

  const entities = useQuery({
    queryKey: ["legal-entities"],
    queryFn: () => listLegalEntities(),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      upsertCompensation(editing!.employee_id, {
        pay_type: values.pay_type,
        rate_amount: String(values.rate_amount),
        official_amount: String(values.official_amount ?? 0),
        legal_entity_id: values.legal_entity_id ?? null,
        kaspi_details: values.kaspi_details || null,
        note: values.note || null,
      }),
    onSuccess: () => {
      message.success("Сохранено");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["payroll-compensations"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openEdit(row: CompensationOut) {
    setEditing(row);
    form.setFieldsValue({
      pay_type: row.pay_type,
      rate_amount: Number(row.rate_amount),
      official_amount: Number(row.official_amount),
      legal_entity_id: row.legal_entity_id,
      kaspi_details: row.kaspi_details ?? undefined,
      note: row.note ?? undefined,
    });
  }

  const columns: ColumnsType<CompensationOut> = [
    { title: "ФИО", dataIndex: "employee_name", width: 260, fixed: "left" },
    { title: "Должность", dataIndex: "position", render: (v: string | null) => v || "—" },
    { title: "Цех", dataIndex: "department_name", width: 150, render: (v: string | null) => v || "—" },
    {
      title: "Тип оплаты",
      dataIndex: "pay_type",
      width: 110,
      render: (v: PayType) => <Tag>{PAY_TYPE_LABELS[v]}</Tag>,
    },
    {
      title: "Ставка / оклад",
      dataIndex: "rate_amount",
      width: 130,
      align: "right",
      render: (v: string) => fmtTenge(v),
    },
    {
      title: "Офиц. часть (месяц)",
      dataIndex: "official_amount",
      width: 150,
      align: "right",
      render: (v: string) => (Number(v) > 0 ? fmtTenge(v) : "—"),
    },
    {
      title: "Серая часть",
      dataIndex: "grey_amount",
      width: 120,
      align: "right",
      // null у сменщика с официальной частью — в шаблоне здесь стоит «—»:
      // месячную серую часть без табеля посчитать нельзя.
      render: (v: string | null) => (v == null ? "—" : fmtTenge(v)),
    },
    {
      title: "Доля офиц.",
      dataIndex: "official_share",
      width: 100,
      align: "right",
      render: (v: string | null) => fmtShare(v),
    },
    {
      title: "Оформление",
      dataIndex: "legal_entity_name",
      width: 150,
      render: (v: string | null, row) =>
        v ? (
          <Space size={4} direction="vertical">
            <span>{v}</span>
            {row.legal_entity_kind && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {LEGAL_KIND_LABELS[row.legal_entity_kind]}
              </Typography.Text>
            )}
          </Space>
        ) : (
          "—"
        ),
    },
    {
      title: "Каспи / реквизиты",
      dataIndex: "kaspi_details",
      width: 170,
      render: (v: string | null) => v || "—",
    },
    { title: "Примечание", dataIndex: "note", width: 220, render: (v: string | null) => v || "—" },
    ...(canManage
      ? ([
          {
            title: "",
            key: "actions",
            width: 60,
            fixed: "right",
            render: (_: unknown, row: CompensationOut) => (
              <a onClick={() => openEdit(row)}>
                <EditOutlined />
              </a>
            ),
          },
        ] as ColumnsType<CompensationOut>)
      : []),
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Справочник ставок</h2>
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="ФИО"
          style={{ width: 240 }}
          onSearch={(v) => {
            setSearch(v);
            reset();
          }}
        />
        <Select
          allowClear
          placeholder="Цех"
          style={{ width: 180 }}
          value={departmentId}
          onChange={(v) => {
            setDepartmentId(v);
            reset();
          }}
          options={(departments.data?.items ?? []).map((d) => ({
            value: d.department_id,
            label: d.name,
          }))}
        />
        <Select
          allowClear
          placeholder="Тип оплаты"
          style={{ width: 150 }}
          value={payType}
          onChange={(v) => {
            setPayType(v);
            reset();
          }}
          options={PAY_TYPE_OPTIONS}
        />
      </Space>

      <Table
        rowKey="employee_compensation_id"
        size="small"
        loading={query.isLoading}
        dataSource={query.data?.items ?? []}
        columns={columns}
        scroll={{ x: 1800 }}
        pagination={tablePagination(query.data?.total)}
      />

      <Modal
        open={editing != null}
        title={`Оплата — ${editing?.employee_name ?? ""}`}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Смена ставки, официальной части или оформления закрывает прежнюю карточку и создаёт новую — ведомости прошлых месяцев не поедут."
        />
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="pay_type" label="Тип оплаты" rules={[{ required: true }]}>
            <Select options={PAY_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="rate_amount"
            label="Ставка за смену / оклад за месяц, ₸"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} step={1000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="official_amount"
            label="в т.ч. официальная часть (месяц), ₸"
            extra="0 — официальной части нет, вся оплата наличными"
          >
            <InputNumber min={0} step={1000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="legal_entity_id" label="Оформление (юрлицо)">
            <Select
              allowClear
              options={(entities.data ?? []).map((e) => ({
                value: e.legal_entity_id,
                label: `${e.name} — ${LEGAL_KIND_LABELS[e.kind]}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="kaspi_details" label="Каспи / реквизиты">
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
