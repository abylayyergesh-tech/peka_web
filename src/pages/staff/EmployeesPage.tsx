import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createEmployee,
  listDepartments,
  listEmployees,
  terminateEmployee,
  updateEmployee,
  type EmployeeCreate,
  type EmployeeOut,
  type EmployeeUpdate,
  type Role,
} from "@/api/staff";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { EmployeeStatusTag, ROLE_OPTIONS } from "@/pages/staff/shared";

interface EmployeeFormValues {
  email?: string;
  role?: Role;
  full_name: string;
  position?: string;
  phone?: string;
  hire_date?: Dayjs;
  department_id?: number;
  personnel_no?: string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Работает" },
  { value: "terminated", label: "Уволен" },
];

export default function EmployeesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const { limit, offset, tablePagination, reset } = usePagination();

  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [q, setQ] = useState("");

  const [editing, setEditing] = useState<EmployeeOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [terminationDate, setTerminationDate] = useState<Dayjs | null>(null);
  const [form] = Form.useForm<EmployeeFormValues>();

  const query = useQuery({
    queryKey: ["employees", { limit, offset, departmentId, statusFilter, q }],
    queryFn: () =>
      listEmployees({
        limit,
        offset,
        department_id: departmentId,
        status: statusFilter,
        q: q || undefined,
      }),
  });

  const deptQuery = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const deptOptions =
    deptQuery.data?.items.map((d) => ({ value: d.department_id, label: d.name })) ?? [];

  const save = useMutation({
    mutationFn: (body: EmployeeCreate | EmployeeUpdate) =>
      editing ? updateEmployee(editing.employee_id, body) : createEmployee(body as EmployeeCreate),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Сотрудник создан");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const terminate = useMutation({
    mutationFn: (vars: { id: number; date: string | null }) =>
      terminateEmployee(vars.id, { termination_date: vars.date }),
    onSuccess: () => {
      message.success("Сотрудник уволен");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: EmployeeOut) {
    setEditing(row);
    form.setFieldsValue({
      full_name: row.full_name,
      position: row.position ?? undefined,
      phone: row.phone ?? undefined,
      hire_date: row.hire_date ? dayjs(row.hire_date) : undefined,
      department_id: row.department_id ?? undefined,
      personnel_no: row.personnel_no ?? undefined,
    });
    setModalOpen(true);
  }

  function onFinish(values: EmployeeFormValues) {
    const common: EmployeeUpdate = {
      full_name: values.full_name,
      position: values.position || null,
      phone: values.phone || null,
      hire_date: values.hire_date ? values.hire_date.format("YYYY-MM-DD") : null,
      department_id: values.department_id ?? null,
      personnel_no: values.personnel_no || null,
    };
    if (editing) {
      save.mutate(common);
    } else {
      save.mutate({
        ...common,
        email: values.email as string,
        role: values.role as Role,
      });
    }
  }

  const columns: ColumnsType<EmployeeOut> = [
    { title: "Таб. №", dataIndex: "personnel_no", width: 90, render: (v) => v || "—" },
    { title: "ФИО", dataIndex: "full_name" },
    { title: "Должность", dataIndex: "position", render: (v) => v || "—" },
    { title: "Отдел", dataIndex: "department_name", render: (v) => v || "—" },
    { title: "Email", dataIndex: "user_email", render: (v) => v || "—" },
    { title: "Телефон", dataIndex: "phone", render: (v) => v || "—" },
    { title: "Принят", dataIndex: "hire_date", render: (v) => fmtDate(v) },
    {
      title: "Статус",
      dataIndex: "status",
      width: 110,
      render: (v) => <EmployeeStatusTag status={v} />,
    },
    {
      title: "",
      width: 150,
      render: (_, row) =>
        canManage && (
          <Space size="small">
            <a onClick={() => openEdit(row)}>Изменить</a>
            {row.status === "active" && (
              <Popconfirm
                title="Уволить сотрудника?"
                description={
                  <div style={{ marginTop: 8 }}>
                    <DatePicker
                      value={terminationDate}
                      onChange={setTerminationDate}
                      format="DD.MM.YYYY"
                      placeholder="Дата увольнения"
                      style={{ width: 200 }}
                      getPopupContainer={(trigger) =>
                        trigger.parentElement as HTMLElement
                      }
                    />
                  </div>
                }
                okText="Уволить"
                cancelText="Отмена"
                okButtonProps={{ danger: true, loading: terminate.isPending }}
                onOpenChange={(open) => {
                  if (open) setTerminationDate(null);
                }}
                onConfirm={() =>
                  terminate.mutate({
                    id: row.employee_id,
                    date: terminationDate ? terminationDate.format("YYYY-MM-DD") : null,
                  })
                }
              >
                <a style={{ color: "#cf1322" }}>Уволить</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Сотрудники</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          placeholder="Отдел"
          style={{ width: 200 }}
          value={departmentId}
          onChange={(v) => {
            setDepartmentId(v);
            reset();
          }}
          options={deptOptions}
          showSearch
          optionFilterProp="label"
        />
        <Select
          allowClear
          placeholder="Статус"
          style={{ width: 160 }}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            reset();
          }}
          options={STATUS_OPTIONS}
        />
        <Input.Search
          allowClear
          placeholder="Поиск: ФИО, email, таб. №"
          style={{ width: 260 }}
          onSearch={(v) => {
            setQ(v);
            reset();
          }}
          onChange={(e) => {
            if (!e.target.value) {
              setQ("");
              reset();
            }
          }}
        />
      </Space>

      <Table
        rowKey="employee_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        scroll={{ x: 900 }}
      />

      <Modal
        title={editing ? "Изменить сотрудника" : "Новый сотрудник"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {!editing && (
            <>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: "Обязательное поле" },
                  { type: "email", message: "Некорректный email" },
                ]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="role"
                label="Роль"
                rules={[{ required: true, message: "Обязательное поле" }]}
              >
                <Select options={ROLE_OPTIONS} placeholder="Выберите роль" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="full_name"
            label="ФИО"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="position" label="Должность">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input />
          </Form.Item>
          <Form.Item name="hire_date" label="Дата приёма">
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="department_id" label="Отдел">
            <Select
              allowClear
              options={deptOptions}
              showSearch
              optionFilterProp="label"
              placeholder="Без отдела"
            />
          </Form.Item>
          <Form.Item name="personnel_no" label="Табельный номер">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
