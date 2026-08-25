/** /customers — customer list + CRUD modal (cap customer.manage). */
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space,
  Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCustomer, deleteCustomer, listCustomers, listMenus, updateCustomer,
  type BillingMode, type CustomerCreate, type CustomerOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import {
  EntityTag,
  NO_ENTITY_FILTER,
  entityFilterOptions,
  useCompanyEntities,
} from "@/pages/finance/companyEntities";
import { assignCustomersEntity } from "@/api/companies";
import { Money } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  BILLING_MODE, BILLING_MODE_OPTIONS, BillingModeTag,
} from "@/pages/sales/statusTags";

/** Куда переводится клиент по кнопке «Перевести» — категорий ровно две. */
const OTHER_MODE: Record<BillingMode, BillingMode> = {
  weekly: "per_order",
  per_order: "weekly",
};

export default function CustomersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [modeFilter, setModeFilter] = useState<BillingMode | "all">("all");
  const billing_mode = modeFilter === "all" ? undefined : modeFilter;
  const [editing, setEditing] = useState<CustomerOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Фильтр по нашему юр. лицу — в адресе: на страницу проваливаются ссылкой из
  // «Денег по юр. лицам» («у этого юрлица 24 клиента»).
  const [urlParams, setUrlParams] = useSearchParams();
  const entityFilter = urlParams.get("company_entity") ?? undefined;
  const entities = useCompanyEntities(true);
  // Выделенные клиенты — их относят к юрлицу пачкой: клиентов сотни, а юрлиц два.
  const [selected, setSelected] = useState<number[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | undefined>();
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["customers", { limit, offset, active, billing_mode }],
    queryFn: () => listCustomers({ limit, offset, active, billing_mode }),
  });

  const menus = useQuery({
    queryKey: ["menus", "active"],
    queryFn: () => listMenus({ active: true }),
    staleTime: 60_000,
  });
  const defaultMenuName =
    menus.data?.find((m) => m.is_default)?.name ?? "Основное меню";
  /** menu_id = null означает базовые цены, то есть основное меню. */
  const menuName = (id: number | null) =>
    id == null
      ? defaultMenuName
      : menus.data?.find((m) => m.menu_id === id)?.name ?? `#${id}`;

  const save = useMutation({
    mutationFn: (values: CustomerCreate) =>
      editing ? updateCustomer(editing.customer_id, values) : createCustomer(values),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Клиент создан");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => {
      message.success("Клиент деактивирован");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  /** Перевод между категориями расчётов. Прайс-лист не трогаем: разделение он
   *  задал однократно при переходе, дальше это независимые атрибуты. */
  const moveMode = useMutation({
    mutationFn: (v: { id: number; mode: BillingMode }) =>
      updateCustomer(v.id, { billing_mode: v.mode }),
    onSuccess: (c) => {
      message.success(`«${c.name}» → ${BILLING_MODE[c.billing_mode].label.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", c.customer_id] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: CustomerOut) {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      credit_limit: row.credit_limit != null ? Number(row.credit_limit) : undefined,
    });
    setModalOpen(true);
  }

  /** Клиенты выбранного юрлица. Фильтр применяется в браузере, потому что список
   *  и так приходит страницами по 50: отдельный серверный фильтр здесь дал бы
   *  тот же результат за лишнюю ручку. Ссылка из сводки ведёт именно сюда. */
  const rows = useMemo(() => {
    const all = query.data?.items ?? [];
    if (!entityFilter) return all;
    if (entityFilter === NO_ENTITY_FILTER) {
      return all.filter((c) => c.company_entity_id == null);
    }
    return all.filter((c) => String(c.company_entity_id) === entityFilter);
  }, [query.data?.items, entityFilter]);

  const assign = useMutation({
    mutationFn: () =>
      assignCustomersEntity({
        customer_ids: selected,
        company_entity_id:
          assignTarget && assignTarget !== NO_ENTITY_FILTER
            ? Number(assignTarget)
            : null,
      }),
    onSuccess: (res) => {
      message.success(
        res.company_entity_name
          ? `Отнесено клиентов: ${res.updated} → «${res.company_entity_name}»`
          : `Привязка снята у ${res.updated} клиентов`,
      );
      setAssignOpen(false);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["company-money"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<CustomerOut> = [
    {
      title: "Название",
      dataIndex: "name",
      render: (v: string, row) => <Link to={`/customers/${row.customer_id}`}>{v}</Link>,
    },
    { title: "Телефон", dataIndex: "phone", render: (v: string | null) => v ?? "—" },
    { title: "Email", dataIndex: "email", render: (v: string | null) => v ?? "—" },
    {
      title: "БИН/ИИН",
      dataIndex: "tax_id",
      width: 150,
      render: (v: string | null) =>
        v ?? <span style={{ color: "#999" }}>самост. точка</span>,
    },
    {
      // НАШЕ юрлицо, а не клиентское: от его имени с клиентом работают, и в его
      // дебиторку попадает долг. БИН клиента — колонка выше, это другое.
      title: "Наше юр. лицо",
      dataIndex: "company_entity_id",
      width: 190,
      render: (id: number | null) => <EntityTag entities={entities.data} id={id} />,
    },
    {
      title: "Прайс-лист",
      dataIndex: "menu_id",
      width: 170,
      render: (v: number | null) =>
        v == null ? (
          <span style={{ color: "#999" }}>{defaultMenuName}</span>
        ) : (
          <Tag color="blue">{menuName(v)}</Tag>
        ),
    },
    {
      title: "Расчёты",
      dataIndex: "billing_mode",
      width: 150,
      render: (v: BillingMode) => (
        <Tooltip title={BILLING_MODE[v]?.hint}>
          <span>
            <BillingModeTag mode={v} />
          </span>
        </Tooltip>
      ),
    },
    {
      title: "Кредитный лимит",
      dataIndex: "credit_limit",
      align: "right",
      render: (v: string | null) => <Money value={v} />,
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean) => (v ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>),
    },
    {
      title: "",
      width: 300,
      render: (_, row) => (
        <Space>
          <Link to={`/customers/${row.customer_id}`}>Карточка</Link>
          {canManage && (
            <>
              <a onClick={() => openEdit(row)}>Изменить</a>
              <Popconfirm
                title="Перевести в другую категорию?"
                description={
                  <span style={{ display: "block", maxWidth: 320 }}>
                    {BILLING_MODE[OTHER_MODE[row.billing_mode]].hint}
                    <br />
                    Прайс-лист клиента не меняется.
                  </span>
                }
                okText="Перевести"
                cancelText="Отмена"
                onConfirm={() =>
                  moveMode.mutate({
                    id: row.customer_id,
                    mode: OTHER_MODE[row.billing_mode],
                  })
                }
              >
                <a>→ {BILLING_MODE[OTHER_MODE[row.billing_mode]].label.toLowerCase()}</a>
              </Popconfirm>
              {row.is_active && (
                <Popconfirm
                  title="Деактивировать клиента?"
                  okText="Да"
                  cancelText="Нет"
                  onConfirm={() => remove.mutate(row.customer_id)}
                >
                  <a>Деактивировать</a>
                </Popconfirm>
              )}
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <h2 style={{ margin: 0 }}>Клиенты</h2>
          <Select
            style={{ width: 150 }}
            value={activeFilter}
            onChange={(v) => {
              setActiveFilter(v);
              reset();
            }}
            options={[
              { value: "all", label: "Все" },
              { value: "active", label: "Активные" },
              { value: "inactive", label: "Неактивные" },
            ]}
          />
          <Select
            allowClear
            placeholder="Все юр. лица"
            style={{ width: 200 }}
            value={entityFilter}
            loading={entities.isPending}
            options={entityFilterOptions(entities.data)}
            onChange={(v) => {
              const next = new URLSearchParams(urlParams);
              if (v) next.set("company_entity", v);
              else next.delete("company_entity");
              setUrlParams(next, { replace: true });
              setSelected([]);
            }}
          />
          <Select
            style={{ width: 210 }}
            value={modeFilter}
            onChange={(v) => {
              setModeFilter(v);
              reset();
            }}
            options={[
              { value: "all", label: "Расчёты: любые" },
              ...BILLING_MODE_OPTIONS.map((o) => ({
                value: o.value,
                label: `Расчёты: ${o.label.toLowerCase()}`,
              })),
            ]}
          />
        </Space>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>
      {selected.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Выбрано клиентов: ${selected.length}`}
          action={
            <Space>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setAssignTarget(undefined);
                  setAssignOpen(true);
                }}
              >
                Отнести к юр. лицу
              </Button>
              <Button size="small" onClick={() => setSelected([])}>
                Снять
              </Button>
            </Space>
          }
        />
      )}
      <Table
        rowKey="customer_id"
        size="small"
        loading={query.isPending}
        dataSource={rows}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        rowSelection={
          canManage
            ? {
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys.map((k) => Number(k))),
                // Список постраничный: без этого выделение на первой странице
                // терялось бы при переходе на вторую.
                preserveSelectedRowKeys: true,
              }
            : undefined
        }
      />
      <Modal
        title={editing ? "Изменить клиента" : "Новый клиент"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            tooltip="Как называем клиента мы: «Кофейня „Утро“». Это же название он
                     видит у себя в профиле как «название заведения»."
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="legal_name"
            label="Юридическое название"
            tooltip="Для счёта: «ТОО „Абадан“», «ИП Иванов». Отдельно от названия —
                     вывеска и юрлицо совпадают редко."
          >
            <Input maxLength={256} placeholder="ТОО, ИП — как в документах" />
          </Form.Item>
          <Form.Item
            name="tax_id"
            label="БИН/ИИН"
            tooltip="Один БИН — один клиент: все кофейни этого юрлица заводятся точками
                     в его карточке. Пусто — точка самостоятельная."
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="bank_account"
            label="Расчётный счёт"
            tooltip="IBAN. Клиент видит его в своём профиле — по нему сверяют реквизиты."
          >
            <Input maxLength={64} placeholder="KZ..." />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Некорректный email" }]}>
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="menu_id"
            label="Прайс-лист"
            tooltip="Не выбран — клиент платит по базовым ценам основного меню"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={defaultMenuName}
              loading={menus.isPending}
              options={menus.data
                ?.filter((m) => !m.is_default)
                .map((m) => ({ value: m.menu_id, label: m.name }))}
            />
          </Form.Item>
          <Form.Item
            name="billing_mode"
            label="Расчёты"
            initialValue="per_order"
            tooltip="Раз в неделю — сводный счёт переводом (договорные кофейни).
                     По заказу — счёт на каждый заказ в клиентском портале."
          >
            <Select options={BILLING_MODE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="company_entity_id"
            label="Наше юр. лицо"
            tooltip="От его имени работают с этим клиентом, и в его дебиторку попадёт долг. Пусто — клиент ни к кому не отнесён."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Не отнесён"
              loading={entities.isPending}
              options={(entities.data ?? [])
                .filter((e) => e.is_active)
                .map((e) => ({
                  value: e.company_entity_id,
                  label: `${e.name} · БИН ${e.tax_id}`,
                }))}
            />
          </Form.Item>
          <Form.Item name="credit_limit" label="Кредитный лимит">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Отнести к юр. лицу: ${selected.length} клиентов`}
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        onOk={() => assign.mutate()}
        okText="Отнести"
        cancelText="Отмена"
        confirmLoading={assign.isPending}
        okButtonProps={{ disabled: !assignTarget }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Select
            style={{ width: "100%" }}
            placeholder="Выберите юр. лицо"
            value={assignTarget}
            options={entityFilterOptions(
              (entities.data ?? []).filter((e) => e.is_active),
            )}
            onChange={setAssignTarget}
          />
          <Alert
            type="info"
            showIcon
            message="На что это влияет"
            description="Долг за новые продажи в кредит пойдёт в дебиторку этого юр. лица. Уже проведённые записи не меняются: переписывать историю задним числом нельзя."
          />
        </Space>
      </Modal>
    </div>
  );
}
