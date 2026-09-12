/** /menus/:id — прайс одного меню: отклонения от базовых цен (cap menu.manage).
 *
 * Показываются ВСЕ позиции меню, а не только те, у которых есть отклонение:
 * иначе исключённую позицию нельзя вернуть в меню, а новой нельзя назначить цену.
 * Поэтому список берётся из /menu-items, а отклонения — из /menus/{id}/prices, и
 * они соединяются здесь.
 *
 * Семантика, ровно как на бэкенде:
 *   пусто + «входит»  -> отклонения нет, платим базовую цену (строка удаляется);
 *   цена  + «входит»  -> своя цена меню;
 *   «не входит»       -> позиция исключена, цены не несёт.
 */
import { SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, App, Button, Drawer, Input, Space, Switch, Table, Tag, Tooltip } from "antd";
import InputNumber from "antd/es/input-number";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getMenu,
  listAllCustomers,
  listAllMenuItems,
  listMenuPrices,
  setMenuPrices,
  type CustomerOut,
  type MenuItemOut,
  type MenuPriceIn,
} from "@/api/sales";
import { useCan } from "@/auth/store";
import { Money } from "@/components/format";
import { PRICE_LISTS_TAB } from "@/pages/sales/MenuPage";
import { BillingModeTag } from "@/pages/sales/statusTags";

/** Правка одной строки до сохранения. */
interface Draft {
  price: number | null;
  included: boolean;
}

export default function MenuPricesPage() {
  const { id } = useParams();
  const menuId = Number(id);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("menu.manage");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [customersOpen, setCustomersOpen] = useState(false);

  const menu = useQuery({ queryKey: ["menu", menuId], queryFn: () => getMenu(menuId) });

  // Постранично: позиций меню бывает больше, чем влезает в одну страницу, а
  // просьба взять всё разом одним `limit` упирается в потолок бэкенда (le=200).
  const items = useQuery({
    queryKey: ["menu-items", "for-prices", menuId],
    queryFn: () => listAllMenuItems({ active: true }),
  });

  const prices = useQuery({
    queryKey: ["menu-prices", menuId],
    queryFn: () => listMenuPrices(menuId),
  });

  const customers = useQuery({
    queryKey: ["customers", { menu_id: menuId }],
    queryFn: () => listAllCustomers({ menu_id: menuId }),
    enabled: customersOpen && Number.isFinite(menuId),
  });

  /** Сохранённое состояние строки: из menu_prices, иначе «отклонения нет». */
  const saved = useMemo(() => {
    const map = new Map<number, Draft>();
    prices.data?.forEach((p) =>
      map.set(p.menu_item_id, {
        price: p.price === null ? null : Number(p.price),
        included: p.is_included,
      }),
    );
    return map;
  }, [prices.data]);

  const stateFor = (itemId: number): Draft =>
    drafts[itemId] ?? saved.get(itemId) ?? { price: null, included: true };

  const isDirty = (itemId: number) => {
    const d = drafts[itemId];
    if (!d) return false;
    const s = saved.get(itemId) ?? { price: null, included: true };
    return d.price !== s.price || d.included !== s.included;
  };

  const dirtyIds = Object.keys(drafts)
    .map(Number)
    .filter((itemId) => isDirty(itemId));

  const setDraft = (itemId: number, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [itemId]: { ...stateFor(itemId), ...patch } }));

  const save = useMutation({
    mutationFn: () => {
      const body: MenuPriceIn[] = dirtyIds.map((itemId) => {
        const d = stateFor(itemId);
        return d.included
          ? { menu_item_id: itemId, price: d.price, is_included: true }
          : { menu_item_id: itemId, price: null, is_included: false };
      });
      return setMenuPrices(menuId, { prices: body });
    },
    onSuccess: () => {
      message.success(`Сохранено изменений: ${dirtyIds.length}`);
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ["menu-prices", menuId] });
      queryClient.invalidateQueries({ queryKey: ["menu-prices"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = items.data ?? [];
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [items.data, search]);

  const overriddenCount = useMemo(() => {
    const ids = new Set<number>(saved.keys());
    dirtyIds.forEach((itemId) => {
      const d = stateFor(itemId);
      if (d.included && d.price === null) ids.delete(itemId);
      else ids.add(itemId);
    });
    return ids.size;
  }, [saved, drafts]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<MenuItemOut> = [
    {
      title: "Позиция",
      dataIndex: "name",
      render: (name: string, row) => (
        <Space>
          {name}
          {row.is_stopped && <Tag color="red">Стоп</Tag>}
        </Space>
      ),
    },
    {
      title: "Категория",
      dataIndex: "category",
      width: 150,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "Базовая цена",
      dataIndex: "sale_price",
      width: 130,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Цена в этом меню",
      key: "price",
      width: 190,
      render: (_, row) => {
        const d = stateFor(row.menu_item_id);
        return (
          <InputNumber
            min={0.01}
            style={{ width: "100%" }}
            disabled={!canManage || !d.included}
            value={d.price ?? undefined}
            placeholder="как в базе"
            onChange={(v) => setDraft(row.menu_item_id, { price: v ?? null })}
          />
        );
      },
    },
    {
      title: "Входит в меню",
      key: "included",
      width: 130,
      align: "center",
      render: (_, row) => {
        const d = stateFor(row.menu_item_id);
        return (
          <Switch
            disabled={!canManage}
            checked={d.included}
            // Исключённая позиция цены не несёт — гасим её сразу, чтобы на бэкенд
            // не ушла заведомо отбрасываемая цена.
            onChange={(v) =>
              setDraft(row.menu_item_id, v ? { included: true } : { included: false, price: null })
            }
          />
        );
      },
    },
    {
      title: "",
      key: "state",
      width: 130,
      render: (_, row) => {
        const d = stateFor(row.menu_item_id);
        if (isDirty(row.menu_item_id)) return <Tag color="orange">изменено</Tag>;
        if (!d.included) return <Tag color="red">исключена</Tag>;
        if (d.price !== null) {
          const diff = d.price - Number(row.sale_price);
          return (
            <Tag color={diff < 0 ? "green" : "gold"}>
              {diff < 0 ? "дешевле" : "дороже"} на {Math.abs(diff)}
            </Tag>
          );
        }
        return null;
      },
    },
  ];

  const customerColumns: ColumnsType<CustomerOut> = [
    {
      title: "Клиент",
      dataIndex: "name",
      render: (v: string, row) => <Link to={`/customers/${row.customer_id}`}>{v}</Link>,
    },
    {
      title: "Телефон",
      dataIndex: "phone",
      width: 140,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "Расчёты",
      dataIndex: "billing_mode",
      width: 150,
      render: (v: CustomerOut["billing_mode"]) => <BillingModeTag mode={v} />,
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 110,
      render: (v: boolean) => (v ? <Tag color="green">Активен</Tag> : <Tag>Неактивен</Tag>),
    },
  ];

  if (menu.data?.is_default) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>{menu.data.name}</h2>
        <Alert
          type="info"
          showIcon
          message="Это основное меню"
          description={
            <>
              У основного меню отклонений не бывает — его цены и есть базовые цены
              позиций. Правьте их на вкладке <Link to="/menu-items">Позиции</Link>.
            </>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space wrap>
          <Link to={PRICE_LISTS_TAB}>← Прайс-листы</Link>
          <h2 style={{ margin: 0 }}>{menu.data?.name ?? "Меню"}</h2>
          {menu.data?.code && <Tag>код iiko {menu.data.code}</Tag>}
          <Tag color="blue">отклонений: {overriddenCount}</Tag>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Поиск позиции"
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Space>
        <Space wrap>
          <Button icon={<TeamOutlined />} onClick={() => setCustomersOpen(true)}>
            Клиенты с этим прайсом
          </Button>
          {canManage && dirtyIds.length > 0 && (
            <Button onClick={() => setDrafts({})}>Отменить правки</Button>
          )}
          {canManage && (
            <Tooltip title={dirtyIds.length === 0 ? "Нет изменений" : undefined}>
              <Button
                type="primary"
                disabled={dirtyIds.length === 0}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Сохранить{dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ""}
              </Button>
            </Tooltip>
          )}
        </Space>
      </Space>

      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message="Пустая цена — позиция продаётся по базовой цене. Хранятся только отличия."
      />
      {/* Без этого сорванная загрузка выглядела как «в прайсе нет позиций»:
          таблица рисовала пустоту, а ошибка нигде не показывалась. */}
      {(items.isError || prices.isError) && (
        <Alert
          style={{ marginBottom: 12 }}
          type="error"
          showIcon
          message="Не удалось загрузить прайс"
          description={errorMessage(items.error ?? prices.error)}
        />
      )}

      <Table
        rowKey="menu_item_id"
        size="small"
        loading={items.isPending || prices.isPending}
        dataSource={filtered}
        pagination={false}
        scroll={{ y: "calc(100vh - 340px)" }}
        columns={columns}
      />

      <Drawer
        title={
          customers.data
            ? `Клиенты с прайсом «${menu.data?.name ?? ""}»: ${customers.data.length}`
            : `Клиенты с прайсом «${menu.data?.name ?? ""}»`
        }
        open={customersOpen}
        onClose={() => setCustomersOpen(false)}
        width={640}
        destroyOnClose
      >
        {customers.isError && (
          <Alert
            style={{ marginBottom: 12 }}
            type="error"
            showIcon
            message="Не удалось загрузить клиентов"
            description={errorMessage(customers.error)}
          />
        )}
        <Table
          rowKey="customer_id"
          size="small"
          loading={customers.isPending}
          dataSource={customers.data}
          columns={customerColumns}
          pagination={false}
          locale={{ emptyText: "На этом прайсе никого нет" }}
        />
      </Drawer>
    </div>
  );
}
