import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
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
import EntityCardDrawer from "@/components/EntityCardDrawer";
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
  const [card, setCard] = useState<DepartmentOut | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
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
    empQuery.data?.items.map((e) => ({ value: e.employee_id, label: e.full_name })) ?? [];

  const fresh =
    query.data?.items.find((r) => r.department_id === card?.department_id) ?? card;

  const save = useMutation({
    mutationFn: (body: DepartmentCreate | DepartmentUpdate) =>
      card
        ? updateDepartment(card.department_id, body)
        : createDepartment(body as DepartmentCreate),
    onSuccess: (row) => {
      message.success(card ? "Сохранено" : "Отдел создан");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setCard(row);
      setEditing(false);
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

  function fillForm(row: DepartmentOut) {
    form.setFieldsValue({
      name: row.name,
      head_employee_id: row.head_employee_id ?? undefined,
      is_active: row.is_active,
    });
  }

  function openCard(row: DepartmentOut) {
    setCard(row);
    fillForm(row);
    setEditing(false);
    setOpen(true);
  }

  function openCreate() {
    setCard(null);
    form.resetFields();
    setEditing(true);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setEditing(false);
    setCard(null);
  }

  function onFinish(values: DepartmentFormValues) {
    if (card) {
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
  ];

  const formBody = (
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
      {card && (
        <Form.Item name="is_active" label="Активен" valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
    </Form>
  );

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
        rowKey="department_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
      />

      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={fresh?.name ?? "Новый отдел"}
        canEdit={canManage && fresh != null}
        editing={editing}
        onStartEdit={() => {
          if (fresh) fillForm(fresh);
          setEditing(true);
        }}
        onCancelEdit={() => {
          if (fresh) {
            fillForm(fresh);
            setEditing(false);
          } else {
            closeCard();
          }
        }}
        onSave={() => form.submit()}
        savePending={save.isPending}
        extra={
          fresh?.is_active && canManage ? (
            <Popconfirm
              title="Деактивировать отдел?"
              okText="Деактивировать"
              cancelText="Отмена"
              okButtonProps={{ danger: true, loading: deactivate.isPending }}
              onConfirm={() => deactivate.mutate(fresh.department_id)}
            >
              <Button danger>Деактивировать</Button>
            </Popconfirm>
          ) : undefined
        }
        view={
          fresh ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Название">{fresh.name}</Descriptions.Item>
              <Descriptions.Item label="Руководитель">
                {fresh.head_employee_name || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                <ActiveTag active={fresh.is_active} />
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={formBody}
      />
    </div>
  );
}
