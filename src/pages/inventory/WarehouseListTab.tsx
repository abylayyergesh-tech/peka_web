/** Вкладка «Список складов»: справочник складов.
 *
 * Ответственные склада — кто работает с ним в приложении сотрудника: видит
 * его остатки, перемещает с него и (с галочкой «Принимает») принимает
 * перемещения на него. Если на складе включено «Подтверждать приём» и есть
 * кому принимать, перемещение сюда ждёт приёма; недостача при приёме
 * списывается отдельным актом. */
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage, fetchAllPages } from "@/api/client";
import {
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  setWarehouseResponsibles,
  updateWarehouse,
  type WarehouseOut,
  type WarehousePurpose,
} from "@/api/inventory";
import { listEmployees } from "@/api/staff";
import { useCan } from "@/auth/store";
import EntityCardDrawer from "@/components/EntityCardDrawer";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { WAREHOUSE_PURPOSE_LABELS } from "@/pages/inventory/shared";

type WarehouseForm = { name: string; purpose: WarehousePurpose; receipt_confirmation: boolean };
type Draft = { employee_id: number; full_name: string; can_receive: boolean };

const PURPOSE_OPTIONS = (
  Object.entries(WAREHOUSE_PURPOSE_LABELS) as [WarehousePurpose, string][]
).map(([value, label]) => ({ value, label }));

export default function WarehouseListTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("inventory.manage");
  const { limit, offset, tablePagination } = usePagination();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [card, setCard] = useState<WarehouseOut | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm<WarehouseForm>();
  const [people, setPeople] = useState<Draft[] | null>(null);
  const employees = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => fetchAllPages((p) => listEmployees({ ...p, status: "active" })),
    staleTime: 60_000,
    enabled: people != null,
  });

  const query = useQuery({
    queryKey: ["warehouses", { limit, offset, includeInactive }],
    queryFn: () =>
      listWarehouses({ limit, offset, include_inactive: includeInactive }),
  });

  const fresh =
    query.data?.items.find((r) => r.warehouse_id === card?.warehouse_id) ?? card;

  function invalidateWarehouses() {
    queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    queryClient.invalidateQueries({ queryKey: ["lookup", "warehouses"] });
  }

  const save = useMutation({
    mutationFn: (values: WarehouseForm) =>
      card ? updateWarehouse(card.warehouse_id, values) : createWarehouse(values),
    onSuccess: (row) => {
      message.success(card ? "Склад сохранён" : "Склад создан");
      setCard(row);
      setEditing(false);
      invalidateWarehouses();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const saveResponsibles = useMutation({
    mutationFn: () =>
      setWarehouseResponsibles(
        card!.warehouse_id,
        (people ?? []).map((p) => ({ employee_id: p.employee_id, can_receive: p.can_receive })),
      ),
    onSuccess: (row) => {
      message.success("Ответственные сохранены");
      setCard(row);
      setPeople(null);
      invalidateWarehouses();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteWarehouse(id),
    onSuccess: () => {
      message.success("Склад деактивирован");
      invalidateWarehouses();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function fillForm(row: WarehouseOut) {
    form.setFieldsValue({
      name: row.name,
      purpose: row.purpose ?? "raw",
      receipt_confirmation: row.receipt_confirmation ?? true,
    });
  }

  function openCard(row: WarehouseOut) {
    setCard(row);
    fillForm(row);
    setEditing(false);
    setOpen(true);
  }

  function openCreate() {
    setCard(null);
    form.resetFields();
    form.setFieldsValue({ purpose: "raw", receipt_confirmation: true });
    setEditing(true);
    setOpen(true);
  }

  function closeCard() {
    setOpen(false);
    setEditing(false);
    setCard(null);
  }

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "flex-end", width: "100%" }}
      >
        <Space size={6}>
          <Switch
            checked={includeInactive}
            onChange={setIncludeInactive}
            size="small"
          />
          <span>Показывать неактивные</span>
        </Space>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      <Table<WarehouseOut>
        rowKey="warehouse_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => openCard(row) })}
        columns={[
          { title: "Название", dataIndex: "name" },
          {
            title: "Назначение",
            dataIndex: "purpose",
            width: 180,
            render: (purpose: WarehousePurpose) =>
              purpose === "finished" ? (
                <Tag color="blue">{WAREHOUSE_PURPOSE_LABELS.finished}</Tag>
              ) : (
                <Tag>{WAREHOUSE_PURPOSE_LABELS.raw}</Tag>
              ),
          },
          {
            title: "Ответственные",
            dataIndex: "responsibles",
            render: (list: WarehouseOut["responsibles"]) =>
              list?.length ? (
                <Space size={[4, 4]} wrap>
                  {list.map((r) => (
                    <Tag key={r.employee_id} color={r.can_receive ? "blue" : undefined}>
                      {r.full_name}
                    </Tag>
                  ))}
                </Space>
              ) : (
                "—"
              ),
          },
          {
            title: "Статус",
            dataIndex: "is_active",
            width: 130,
            render: (active: boolean) =>
              active ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>,
          },
          {
            title: "Создан",
            dataIndex: "created_at",
            width: 160,
            render: (v: string) => fmtDateTime(v),
          },
        ]}
      />

      <EntityCardDrawer
        open={open}
        onClose={closeCard}
        title={fresh?.name ?? "Новый склад"}
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
              title="Деактивировать склад?"
              okText="Деактивировать"
              cancelText="Отмена"
              onConfirm={() => remove.mutate(fresh.warehouse_id)}
            >
              <Button danger>Деактивировать</Button>
            </Popconfirm>
          ) : undefined
        }
        view={
          fresh ? (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Название">{fresh.name}</Descriptions.Item>
              <Descriptions.Item label="Назначение">
                {WAREHOUSE_PURPOSE_LABELS[fresh.purpose]}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                {fresh.is_active ? (
                  <Tag color="green">Активен</Tag>
                ) : (
                  <Tag>Неактивен</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Подтверждать приём">
                {fresh.receipt_confirmation
                  ? "да — перемещения сюда ждут приёма ответственным"
                  : "нет — перемещения проводятся сразу"}
              </Descriptions.Item>
              <Descriptions.Item label="Ответственные">
                <Space direction="vertical" size={4}>
                  {fresh.responsibles?.length ? (
                    fresh.responsibles.map((r) => (
                      <span key={r.employee_id}>
                        {r.full_name} {r.can_receive && <Tag color="blue">принимает</Tag>}
                      </span>
                    ))
                  ) : (
                    <Typography.Text type="secondary">
                      Нет — склад в приложении никто не видит, перемещения сюда проводятся сразу
                    </Typography.Text>
                  )}
                  {canManage && (
                    <Button size="small" onClick={() => setPeople(
                      (fresh.responsibles ?? []).map((r) => ({ ...r })))}>
                      Изменить ответственных
                    </Button>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Создан">
                {fmtDateTime(fresh.created_at)}
              </Descriptions.Item>
            </Descriptions>
          ) : null
        }
        form={
          <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
            <Form.Item
              name="name"
              label="Название"
              rules={[{ required: true, message: "Обязательное поле" }]}
            >
              <Input autoFocus maxLength={256} />
            </Form.Item>
            <Form.Item
              name="purpose"
              label="Назначение"
              rules={[{ required: true, message: "Обязательное поле" }]}
            >
              <Select options={PURPOSE_OPTIONS} />
            </Form.Item>
            <Form.Item
              name="receipt_confirmation"
              label="Подтверждать приём"
              valuePropName="checked"
              extra="Перемещение сюда ждёт, пока ответственный примет товар в приложении. Без ответственных проводится сразу"
            >
              <Switch />
            </Form.Item>
          </Form>
        }
      />

      <Modal
        title={`Ответственные — ${fresh?.name ?? ""}`}
        open={people != null}
        onCancel={() => setPeople(null)}
        onOk={() => saveResponsibles.mutate()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saveResponsibles.isPending}
        width={600}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Ответственный видит склад в приложении и перемещает с него (у должности — право
          «Создание и проведение перемещений»). «Принимает» — принимает перемещения на этот
          склад (право «Приём входящих перемещений»).
        </Typography.Paragraph>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Добавить сотрудника"
          style={{ width: "100%", marginBottom: 12 }}
          value={null}
          loading={employees.isLoading}
          options={(employees.data ?? [])
            .filter((e) => !(people ?? []).some((p) => p.employee_id === e.employee_id))
            .map((e) => ({ value: e.employee_id, label: e.full_name }))}
          onChange={(id: number) => {
            const e = employees.data?.find((x) => x.employee_id === id);
            if (e) setPeople((prev) => [...(prev ?? []),
              { employee_id: e.employee_id, full_name: e.full_name, can_receive: true }]);
          }}
        />
        <Table<Draft>
          rowKey="employee_id"
          size="small"
          pagination={false}
          dataSource={people ?? []}
          locale={{ emptyText: "Никого — добавьте сотрудника" }}
          columns={[
            { title: "Сотрудник", dataIndex: "full_name" },
            {
              title: "Принимает",
              dataIndex: "can_receive",
              width: 110,
              render: (v: boolean, row) => (
                <Checkbox
                  checked={v}
                  onChange={(e) => setPeople((prev) => (prev ?? []).map((p) =>
                    p.employee_id === row.employee_id ? { ...p, can_receive: e.target.checked } : p))}
                />
              ),
            },
            {
              title: "",
              key: "x",
              width: 80,
              render: (_, row) => (
                <a onClick={() => setPeople((prev) =>
                  (prev ?? []).filter((p) => p.employee_id !== row.employee_id))}>Убрать</a>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
