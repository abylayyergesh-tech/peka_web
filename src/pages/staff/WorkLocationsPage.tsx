import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createWorkLocation,
  deactivateWorkLocation,
  listWorkLocations,
  updateWorkLocation,
  type WorkLocationCreate,
  type WorkLocationOut,
  type WorkLocationUpdate,
} from "@/api/attendance";
import { useCan } from "@/auth/store";
import { usePagination } from "@/components/usePagination";
import { ActiveTag } from "@/pages/staff/shared";

interface WorkLocationFormValues {
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active?: boolean;
}

export default function WorkLocationsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("attendance.manage");
  const { limit, offset, tablePagination, reset } = usePagination();

  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<WorkLocationOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<WorkLocationFormValues>();

  const query = useQuery({
    queryKey: ["work-locations", { limit, offset, includeInactive }],
    queryFn: () => listWorkLocations({ limit, offset, include_inactive: includeInactive }),
  });

  const save = useMutation({
    mutationFn: (body: WorkLocationCreate | WorkLocationUpdate) =>
      editing
        ? updateWorkLocation(editing.work_location_id, body)
        : createWorkLocation(body as WorkLocationCreate),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Локация создана");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["work-locations"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => deactivateWorkLocation(id),
    onSuccess: () => {
      message.success("Локация деактивирована");
      queryClient.invalidateQueries({ queryKey: ["work-locations"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: WorkLocationOut) {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      radius_m: row.radius_m,
      is_active: row.is_active,
    });
    setModalOpen(true);
  }

  function onFinish(values: WorkLocationFormValues) {
    if (editing) {
      save.mutate({
        name: values.name,
        latitude: values.latitude,
        longitude: values.longitude,
        radius_m: values.radius_m,
        is_active: values.is_active,
      });
    } else {
      save.mutate({
        name: values.name,
        latitude: values.latitude,
        longitude: values.longitude,
        radius_m: values.radius_m,
      });
    }
  }

  const columns: ColumnsType<WorkLocationOut> = [
    { title: "Название", dataIndex: "name" },
    { title: "Широта", dataIndex: "latitude" },
    { title: "Долгота", dataIndex: "longitude" },
    { title: "Радиус, м", dataIndex: "radius_m", width: 110 },
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
                title="Деактивировать локацию?"
                okText="Деактивировать"
                cancelText="Отмена"
                okButtonProps={{ danger: true, loading: deactivate.isPending }}
                onConfirm={() => deactivate.mutate(row.work_location_id)}
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
        <h2 style={{ margin: 0 }}>Рабочие локации</h2>
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
        rowKey="work_location_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />

      <Modal
        title={editing ? "Изменить локацию" : "Новая локация"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ radius_m: 3000 }}
        >
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="latitude"
            label="Широта"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={-90} max={90} step={0.000001} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="longitude"
            label="Долгота"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={-180} max={180} step={0.000001} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="radius_m"
            label="Радиус (м)"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <InputNumber min={1} max={1000000} style={{ width: "100%" }} />
          </Form.Item>
          {editing && (
            <Form.Item name="is_active" label="Активна" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
