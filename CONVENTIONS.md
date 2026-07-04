# Peka RSM Frontend — конвенции для модулей

Стек: Vite 5 + React 18 + TypeScript (strict) + Ant Design 5 (locale ruRU) +
TanStack Query 5 + react-router-dom 6 + axios + zustand. Alias `@/` = `src/`.

**Запрещено:** добавлять зависимости в package.json, менять файлы вне своего
модуля, запускать npm/tsc/vite. Только писать код своего модуля.

## Структура модуля

```
src/api/<module>.ts            — типы DTO + функции запросов (единственное место, где зовётся axios)
src/pages/<module>/routes.tsx  — ЗАМЕНИТЬ стаб; имя экспорта менять нельзя
src/pages/<module>/*.tsx       — страницы/компоненты модуля
```

## Правила API-слоя

- Импорт: `import { api, errorMessage, errorCode } from "@/api/client";`
  `import type { Page, PageParams } from "@/api/client";`
- Типы DTO пишутся вручную и должны 1:1 соответствовать Pydantic-схемам
  бэкенда (`app/<module>/schemas.py`) — snake_case, не переименовывать.
- Денежные поля бэкенд отдаёт строками (`Decimal` → `"12.50"`), тип — `string`.
- Списки с пагинацией: `Page<T>` (`{items,total,limit,offset}`), параметры `limit`/`offset`.
- Даты: ISO-строки; `string`.

## Правила страниц

- Все надписи UI — на русском. Названия полей DTO — как в бэкенде.
- Списки: `useQuery` + `usePagination` (см. пример ниже).
- Мутации: `useMutation` + `message.success(...)` + `queryClient.invalidateQueries(...)`.
  `message` берём ТОЛЬКО через `App.useApp()` (не статический импорт).
- Ошибки: `message.error(errorMessage(e))`.
- Деньги: `<Money value={row.total} />` или `fmtMoney()`; количества `fmtQty()`;
  даты `fmtDate()/fmtDateTime()` из `@/components/format`.
- Гейтинг по правам: `useCan("<capability>")` из `@/auth/store` — скрывать/дизейблить
  кнопки записи, если права нет. Чтение доступно всем участникам организации,
  если не сказано иное.
- Формы — в `Modal` поверх списка (`Form` antd, `layout="vertical"`). Для
  create+edit использовать одну модалку с `initialValues`.
- Опасные действия (удаление, void, проведение) — через `Popconfirm`.
- `Select` с данными из другого эндпоинта: отдельный `useQuery` со
  `staleTime: 60_000`, `showSearch`, `optionFilterProp="label"`.
- Статусы (`draft/posted/...`) — `<Tag>` с цветом и русской подписью.

## routes.tsx (пример замены стаба)

```tsx
import type { RouteObject } from "react-router-dom";

import ProductsPage from "@/pages/catalog/ProductsPage";
import UnitsPage from "@/pages/catalog/UnitsPage";

export const catalogRoutes: RouteObject[] = [
  { path: "/products", element: <ProductsPage /> },
  { path: "/units", element: <UnitsPage /> },
];
```

Пути страниц ФИКСИРОВАНЫ — они прописаны в `src/layout/menu.ts`; регистрируй
ровно те пути, которые тебе выданы в задании (плюс свои detail-страницы вида
`/suppliers/:id` — они в меню не входят, но роутом быть должны).

## Эталон: страница списка с CRUD

```tsx
import { PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Modal, Space, Table } from "antd";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { createWidget, listWidgets, updateWidget, type WidgetOut } from "@/api/widgets";
import { useCan } from "@/auth/store";
import { usePagination } from "@/components/usePagination";

export default function WidgetsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("widget.manage");
  const { limit, offset, tablePagination } = usePagination();
  const [editing, setEditing] = useState<WidgetOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const query = useQuery({
    queryKey: ["widgets", { limit, offset }],
    queryFn: () => listWidgets({ limit, offset }),
  });

  const save = useMutation({
    mutationFn: (values: { name: string }) =>
      editing ? updateWidget(editing.id, values) : createWidget(values),
    onSuccess: () => {
      message.success(editing ? "Сохранено" : "Создано");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["widgets"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }
  function openEdit(row: WidgetOut) {
    setEditing(row);
    form.setFieldsValue(row);
    setModalOpen(true);
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Виджеты</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={[
          { title: "Название", dataIndex: "name" },
          {
            title: "",
            width: 90,
            render: (_, row) =>
              canManage && <a onClick={() => openEdit(row)}>Изменить</a>,
          },
        ]}
      />
      <Modal
        title={editing ? "Изменить виджет" : "Новый виджет"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: "Обязательное поле" }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

`src/api/widgets.ts` к нему:

```ts
import { api } from "@/api/client";
import type { Page, PageParams } from "@/api/client";

export interface WidgetOut {
  id: number;
  name: string;
}

export async function listWidgets(params: PageParams): Promise<Page<WidgetOut>> {
  const { data } = await api.get<Page<WidgetOut>>("/widgets", { params });
  return data;
}

export async function createWidget(body: { name: string }): Promise<WidgetOut> {
  const { data } = await api.post<WidgetOut>("/widgets", body);
  return data;
}

export async function updateWidget(id: number, body: Partial<{ name: string }>): Promise<WidgetOut> {
  const { data } = await api.patch<WidgetOut>(`/widgets/${id}`, body);
  return data;
}
```

## Типичные ловушки

- `tsconfig` strict + `noUnusedLocals` — не оставляй неиспользуемых импортов.
- antd v5: `open` (не `visible`), `destroyOnClose` у Modal, `options` у Select.
- Table `columns` с типом: `import type { ColumnsType } from "antd/es/table";`
- DatePicker отдаёт dayjs-объект: сериализуй `value.format("YYYY-MM-DD")` перед POST.
- Backend отдаёт 404 для чужой/неверной организации, 403 при нехватке прав —
  показывай `errorMessage(e)`, не падай.
