import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createDepartment,
  deactivateDepartment,
  listDepartments,
  listEmployees,
  updateDepartment,
  type DepartmentCreate,
  type DepartmentOut,
  type DepartmentUpdate,
} from "@/api/staff";
import { useCan } from "@/auth/store";
import { usePagination } from "@/components/usePagination";
import { ActiveTag } from "@/pages/staff/shared";

interface DepartmentFormValues {
  name: string;
  head_employee_id?: number;
  is_active?: boolean;
}

export default function DepartmentsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const { limit, offset, tablePagination, reset } = usePagination();

  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<DepartmentOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<DepartmentFormValues>();

  const query = useQuery({
    queryKey: ["departments", { limit, offset, includeInactive }],
    queryFn: () => listDepartments({ limit, offset, include_inactive: includeInactive }),
  });

  const empQuery = useQuery({
    queryKey: ["employees", "options"],
    queryFn: () => listEmployees({ limit: 200, offset: 0, status: "active" }),
    staleTime: 60_000,
  });
  const empOptions =
    empQuery.data?.items.map((e) => ({ value: e.id, label: e.full_name })) ?? [];

  const save = useMutation({
    mutationFn: (body: DepartmentCreate | DepartmentUpdate) =>
      editing ? updateDepartment(editing.id, body) : createDepartment(body as DepartmentCreate),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Отдел создан");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => deactivateDepartment(id),
    onSuccess: () => {
      message.success("Отдел деактивирован");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: DepartmentOut) {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      head_employee_id: row.head_employee_id ?? undefined,
      is_active: row.is_active,
    });
    setModalOpen(true);
  }

  function onFinish(values: DepartmentFormValues) {
    if (editing) {
      save.mutate({
        name: values.name,
        head_employee_id: values.head_employee_id ?? null,
        is_active: values.is_active,
      });
    } else {
      save.mutate({
        name: values.name,
        head_employee_id: values.head_employee_id ?? null,
      });
    }
  }

  const columns: ColumnsType<DepartmentOut> = [
    { title: "Название", dataIndex: "name" },
    {
      title: "Руководитель",
      dataIndex: "head_employee_name",
      render: (v) => v || "—",
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 120,
      render: (v: boolean) => <ActiveTag active={v} />,
    },
    {
      title: "",
      width: 180,
      render: (_, row) =>
        canManage && (
          <Space size="small">
            <a onClick={() => openEdit(row)}>Изменить</a>
            {row.is_active && (
              <Popconfirm
                title="Деактивировать отдел?"
                okText="Деактивировать"
                cancelText="Отмена"
                okButtonProps={{ danger: true, loading: deactivate.isPending }}
                onConfirm={() => deactivate.mutate(row.id)}
              >
                <a style={{ color: "#cf1322" }}>Деактивировать</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Отделы</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Checkbox
          checked={includeInactive}
          onChange={(e) => {
            setIncludeInactive(e.target.checked);
            reset();
          }}
        >
          Показывать неактивные
        </Checkbox>
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
        title={editing ? "Изменить отдел" : "Новый отдел"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="head_employee_id" label="Руководитель">
            <Select
              allowClear
              options={empOptions}
              showSearch
              optionFilterProp="label"
              placeholder="Не назначен"
            />
          </Form.Item>
          {editing && (
            <Form.Item name="is_active" label="Активен" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
