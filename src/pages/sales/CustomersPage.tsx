/** /customers — customer list + CRUD modal (cap customer.manage). */
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Form, Input, InputNumber, Modal, Select, Space,
  Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { listAssignments } from "@/api/delivery";
import {
  assignCustomersCategory,
  createCustomer, listCustomers, listMenus, updateCustomer,
  type BillingMode, type CustomerCreate, type CustomerOut,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import TableColumnSettings from "@/components/TableColumnSettings";
import {
  useTableColumnSettings,
  type TableColumnSpec,
} from "@/components/useTableColumnSettings";
import CustomerCategoriesModal, {
  useCustomerCategories,
} from "@/pages/sales/CustomerCategoriesModal";
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

/** Колонки, которые можно спрятать. Название всегда на месте. */
const CUSTOMER_COLUMN_SPECS: TableColumnSpec[] = [
  { key: "name", label: "Название", locked: true },
  { key: "customer_category_id", label: "Категория" },
  { key: "legal_name", label: "Юр. название", defaultVisible: false },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "tax_id", label: "БИН/ИИН" },
  { key: "bank_account", label: "Расчётный счёт", defaultVisible: false },
  { key: "company_entity_id", label: "Наше юр. лицо" },
  { key: "menu_id", label: "Прайс-лист" },
  { key: "billing_mode", label: "Расчёты" },
  { key: "credit_limit", label: "Кредитный лимит" },
  { key: "note", label: "Примечание", defaultVisible: false },
  { key: "courier", label: "Курьер (завтра)" },
  { key: "is_active", label: "Статус" },
];

export default function CustomersPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useCan("customer.manage");
  const { limit, offset, tablePagination, reset } = usePagination();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const active = activeFilter === "all" ? undefined : activeFilter === "active";
  const [modeFilter, setModeFilter] = useState<BillingMode | "all">("all");
  const billing_mode = modeFilter === "all" ? undefined : modeFilter;
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [editing, setEditing] = useState<CustomerOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dictOpen, setDictOpen] = useState(false);
  const [assignCatOpen, setAssignCatOpen] = useState(false);
  const [assignCatTarget, setAssignCatTarget] = useState<number | null | undefined>();
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
    queryKey: ["customers", { limit, offset, active, billing_mode, categoryFilter }],
    queryFn: () =>
      listCustomers({
        limit,
        offset,
        active,
        billing_mode,
        category: categoryFilter,
      }),
  });
  const categories = useCustomerCategories();
  const colSettings = useTableColumnSettings("customers", CUSTOMER_COLUMN_SPECS);
  const categoryName = (id: number | null) => {
    if (id == null) return null;
    return (
      categories.data?.find((c) => c.customer_category_id === id)?.name ?? `#${id}`
    );
  };

  const menus = useQuery({
    queryKey: ["menus", "active"],
    queryFn: () => listMenus({ active: true }),
    staleTime: 60_000,
  });
  const assignments = useQuery({
    queryKey: ["delivery-assignments", "tomorrow"],
    queryFn: () => listAssignments(dayjs().add(1, "day").format("YYYY-MM-DD")),
  });
  const couriersByCustomer = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const row of assignments.data ?? []) {
      if (row.customer_id == null || !row.courier_name) continue;
      const list = map.get(row.customer_id) ?? [];
      if (!list.includes(row.courier_name)) list.push(row.courier_name);
      map.set(row.customer_id, list);
    }
    return map;
  }, [assignments.data]);
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

  function openCreate() {
    setEditing(null);
    form.resetFields();
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

  const assignCategory = useMutation({
    mutationFn: () =>
      assignCustomersCategory({
        customer_ids: selected,
        customer_category_id: assignCatTarget ?? null,
      }),
    onSuccess: (res) => {
      message.success(
        res.customer_category_name
          ? `Отнесено клиентов: ${res.updated} → «${res.customer_category_name}»`
          : `Категория снята у ${res.updated} клиентов`,
      );
      setAssignCatOpen(false);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-categories"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<CustomerOut> = [
    {
      key: "name",
      title: "Название",
      dataIndex: "name",
      render: (v: string) => v,
    },
    {
      key: "customer_category_id",
      title: "Категория",
      dataIndex: "customer_category_id",
      width: 150,
      render: (id: number | null) => {
        const name = categoryName(id);
        if (!name) return <span style={{ color: "#999" }}>—</span>;
        const off = categories.data?.find((c) => c.customer_category_id === id)?.is_active === false;
        return <Tag color={off ? "default" : "purple"}>{name}</Tag>;
      },
    },
    {
      key: "legal_name",
      title: "Юр. название",
      dataIndex: "legal_name",
      width: 180,
      render: (v: string | null) => v ?? "—",
    },
    { key: "phone", title: "Телефон", dataIndex: "phone", render: (v: string | null) => v ?? "—" },
    { key: "email", title: "Email", dataIndex: "email", render: (v: string | null) => v ?? "—" },
    {
      key: "tax_id",
      title: "БИН/ИИН",
      dataIndex: "tax_id",
      width: 150,
      render: (v: string | null) =>
        v ?? <span style={{ color: "#999" }}>самост. точка</span>,
    },
    {
      key: "bank_account",
      title: "Расчётный счёт",
      dataIndex: "bank_account",
      width: 180,
      render: (v: string | null) => v ?? "—",
    },
    {
      // НАШЕ юрлицо, а не клиентское: от его имени с клиентом работают, и в его
      // дебиторку попадает долг. БИН клиента — колонка выше, это другое.
      key: "company_entity_id",
      title: "Наше юр. лицо",
      dataIndex: "company_entity_id",
      width: 190,
      render: (id: number | null) => <EntityTag entities={entities.data} id={id} />,
    },
    {
      key: "menu_id",
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
      key: "billing_mode",
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
      key: "credit_limit",
      title: "Кредитный лимит",
      dataIndex: "credit_limit",
      align: "right",
      render: (v: string | null) => <Money value={v} />,
    },
    {
      key: "note",
      title: "Примечание",
      dataIndex: "note",
      ellipsis: true,
      render: (v: string | null) => v ?? "—",
    },
    {
      key: "courier",
      title: "Курьер (завтра)",
      width: 180,
      render: (_, row) => {
        const names = couriersByCustomer.get(row.customer_id);
        if (!names?.length) return <span style={{ color: "#999" }}>—</span>;
        return names.map((n) => (
          <Tag key={n} color="blue">
            {n}
          </Tag>
        ));
      },
    },
    {
      key: "is_active",
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean) => (v ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>),
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
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Все категории"
            style={{ width: 200 }}
            loading={categories.isPending}
            value={categoryFilter}
            onChange={(v) => {
              setCategoryFilter(v);
              reset();
            }}
            options={[
              { value: 0, label: "Без категории" },
              ...(categories.data ?? []).map((c) => ({
                value: c.customer_category_id,
                label: c.is_active ? c.name : `${c.name} (откл.)`,
              })),
            ]}
          />
        </Space>
        <Space>
          <TableColumnSettings settings={colSettings} />
          {canManage && (
            <>
              <Button onClick={() => setDictOpen(true)}>Категории</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Добавить
              </Button>
            </>
          )}
        </Space>
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
              <Button
                size="small"
                onClick={() => {
                  setAssignCatTarget(undefined);
                  setAssignCatOpen(true);
                }}
              >
                Отнести к категории
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
        columns={columns.map((col) => ({
          ...col,
          hidden: !colSettings.isVisible(String(col.key)),
        }))}
        scroll={{ x: 1400 }}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({
          onClick: () => navigate(`/customers/${row.customer_id}`),
        })}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) =>
            save.mutate({
              ...v,
              customer_category_id: v.customer_category_id ?? null,
            })
          }
        >
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
            name="customer_category_id"
            label="Категория"
            tooltip="Тип клиента из словаря: комп клуб, кофейня, школа. Пусто — без категории."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Без категории"
              loading={categories.isPending}
              options={(categories.data ?? [])
                .filter(
                  (c) =>
                    c.is_active ||
                    c.customer_category_id === editing?.customer_category_id,
                )
                .map((c) => ({
                  value: c.customer_category_id,
                  label: c.is_active ? c.name : `${c.name} (откл.)`,
                }))}
            />
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

      <Modal
        title={`Отнести к категории: ${selected.length} клиентов`}
        open={assignCatOpen}
        onCancel={() => setAssignCatOpen(false)}
        onOk={() => assignCategory.mutate()}
        okText="Отнести"
        cancelText="Отмена"
        confirmLoading={assignCategory.isPending}
        okButtonProps={{ disabled: assignCatTarget === undefined }}
        destroyOnHidden
      >
        <Select
          style={{ width: "100%" }}
          placeholder="Выберите категорию"
          value={assignCatTarget === undefined ? undefined : assignCatTarget}
          allowClear
          showSearch
          optionFilterProp="label"
          options={[
            { value: 0, label: "Снять категорию" },
            ...(categories.data ?? [])
              .filter((c) => c.is_active)
              .map((c) => ({
                value: c.customer_category_id,
                label: c.name,
              })),
          ]}
          onChange={(v) => setAssignCatTarget(v === 0 || v == null ? null : v)}
        />
      </Modal>

      <CustomerCategoriesModal open={dictOpen} onClose={() => setDictOpen(false)} />
    </div>
  );
}
