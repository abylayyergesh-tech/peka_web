import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
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
import EntityCardDrawer from "@/components/EntityCardDrawer";
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
  const [card, setCard] = useState<WorkLocationOut | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<WorkLocationFormValues>();

  const query = useQuery({
    queryKey: ["work-locations", { limit, offset, includeInactive }],
    queryFn: () => listWorkLocations({ limit, offset, include_inactive: includeInactive }),
  });

  const fresh =
    query.data?.items.find((r) => r.work_location_id === card?.work_location_id) ?? card;

  const save = useMutation({
    mutationFn: (body: WorkLocationCreate | WorkLocationUpdate) =>
      card
        ? updateWorkLocation(card.work_location_id, body)
        : createWorkLocation(body as WorkLocationCreate),
    onSuccess: (row) => {
      message.success(card ? "Сохранено" : "Локация создана");
      queryClient.invalidateQueries({ queryKey: ["work-locations"] });
      setCard(row);
      setEditing(false);
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

  function fillForm(row: WorkLocationOut) {
    form.setFieldsValue({
      name: row.name,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      radius_m: row.radius_m,
      is_active: row.is_active,
    });
  }

  function openCard(row: WorkLocationOut) {
    setCard(row);
    fillForm(row);
    setEditing(false);
    setOpen(true);
  }

  function openCreate() {
    setCard(null);
    form.resetFields();
    form.setFieldsValue({ radius_m: 3000 });
    setEditing(true);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setEditing(false);
    setCard(null);
  }

  function onFinish(values: WorkLocationFormValues) {
    if (card) {
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
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
      />

      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={fresh?.name ?? "Новая локация"}
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
              title="Деактивировать локацию?"
              okText="Деактивировать"
              cancelText="Отмена"
              okButtonProps={{ danger: true, loading: deactivate.isPending }}
              onConfirm={() => deactivate.mutate(fresh.work_location_id)}
            >
              <Button danger>Деактивировать</Button>
            </Popconfirm>
          ) : undefined
        }
        view={
          fresh ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Название">{fresh.name}</Descriptions.Item>
              <Descriptions.Item label="Широта">{fresh.latitude}</Descriptions.Item>
              <Descriptions.Item label="Долгота">{fresh.longitude}</Descriptions.Item>
              <Descriptions.Item label="Радиус">{fresh.radius_m} м</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <ActiveTag active={fresh.is_active} />
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={
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
            {card && (
              <Form.Item name="is_active" label="Активна" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
          </Form>
        }
      />
    </div>
  );
}
