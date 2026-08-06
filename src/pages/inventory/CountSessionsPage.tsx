/** /inventory-count — список инвентаризационных сессий.
 *
 *  Сессия — это обход полок, который живёт в базе: его открывают, ведут часами и
 *  несколькими людьми, прерывают и продолжают на следующий день, а в конце
 *  закрывают проводкой. Прежний экран держал введённое в браузере и отправлял
 *  всё одним куском — закрытая вкладка стирала обход целиком.
 *
 *  Поэтому первый экран — именно список: чаще всего сюда заходят продолжить
 *  начатое, а не начать заново. Открытая сессия поэтому идёт первой строкой и
 *  ведёт прямо в лист. */
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert, App, Button, Checkbox, DatePicker, Form, Input, Modal, Segmented,
  Select, Space, Table, Tag, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCountSession,
  listCountSessions,
  type CountSessionOut,
  type SessionStatus,
} from "@/api/counting";
import { useCan } from "@/auth/store";
import { fmtDate } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { SessionStatusTag } from "@/pages/inventory/countShared";
import { useWarehousesLookup } from "@/pages/inventory/shared";

interface SessionForm {
  name: string;
  count_date: Dayjs;
  warehouse_ids: number[];
  note?: string;
  prefill: boolean;
}

export default function CountSessionsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCount = useCan("inventory.count");
  const warehouses = useWarehousesLookup();
  const { limit, offset, tablePagination, reset } = usePagination();
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<SessionForm>();

  const query = useQuery({
    queryKey: ["count-sessions", { limit, offset, status }],
    queryFn: () =>
      listCountSessions({
        limit,
        offset,
        ...(status === "all" ? {} : { status }),
      }),
  });

  const create = useMutation({
    mutationFn: (values: SessionForm) =>
      createCountSession({
        name: values.name.trim(),
        count_date: values.count_date.format("YYYY-MM-DD"),
        warehouse_ids: values.warehouse_ids,
        note: values.note?.trim() || null,
        prefill: values.prefill,
      }),
    onSuccess: (session) => {
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["count-sessions"] });
      message.success(
        session.lines_total
          ? `Сессия открыта, в листе ${session.lines_total} позиций`
          : "Сессия открыта. Лист пустой — позиции добавятся по мере обхода",
      );
      navigate(`/inventory-count/${session.inventory_count_session_id}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    form.resetFields();
    form.setFieldsValue({
      name: `Инвентаризация ${dayjs().format("DD.MM.YYYY")}`,
      count_date: dayjs(),
      warehouse_ids: [],
      prefill: true,
    });
    setModalOpen(true);
  }

  const columns: ColumnsType<CountSessionOut> = [
    {
      title: "Дата",
      dataIndex: "count_date",
      width: 120,
      render: (v: string) => fmtDate(v),
    },
    {
      title: "Название",
      dataIndex: "name",
      render: (v: string, row) => (
        <a onClick={() => navigate(`/inventory-count/${row.inventory_count_session_id}`)}>
          {v}
        </a>
      ),
    },
    {
      title: "Состояние",
      dataIndex: "status",
      width: 130,
      render: (s: SessionStatus) => <SessionStatusTag status={s} />,
    },
    {
      title: "Склады",
      key: "warehouses",
      render: (_, row) => (
        <Space wrap size={4}>
          {row.warehouses.map((w) => (
            <Tooltip
              key={w.warehouse_id}
              title={
                `${w.counted} из ${w.lines_total} посчитано` +
                (w.document_number ? `, документ №${w.document_number}` : "")
              }
            >
              <Tag style={{ marginInlineEnd: 0 }}>{w.warehouse_name}</Tag>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: "Посчитано",
      key: "progress",
      width: 130,
      align: "right",
      render: (_, row) =>
        row.lines_total === 0 ? (
          <span style={{ color: "#bbb" }}>лист пуст</span>
        ) : (
          <span
            style={{
              color: row.counted === row.lines_total ? "#389e0d" : undefined,
            }}
          >
            {row.counted} / {row.lines_total}
          </span>
        ),
    },
    {
      title: "Нестыковок",
      dataIndex: "discrepancies",
      width: 120,
      align: "right",
      render: (v: number) =>
        v > 0 ? <b style={{ color: "#cf1322" }}>{v}</b> : <span>0</span>,
    },
    {
      title: "Открыл",
      dataIndex: "opened_by_name",
      width: 170,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "",
      width: 190,
      render: (_, row) => (
        <Space size="middle">
          <a onClick={() => navigate(`/inventory-count/${row.inventory_count_session_id}`)}>
            {row.status === "open" ? "Продолжить" : "Открыть"}
          </a>
          <a
            onClick={() =>
              navigate(`/inventory-count/${row.inventory_count_session_id}/report`)
            }
          >
            Отчёт
          </a>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>Инвентаризация</h2>
        {canCount && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Открыть сессию
          </Button>
        )}
      </Space>

      {!canCount && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Только просмотр"
          description="Вести и закрывать инвентаризацию может администрация — нужно право inventory.count."
        />
      )}

      <Segmented<SessionStatus | "all">
        style={{ marginBottom: 16 }}
        value={status}
        onChange={(v) => {
          setStatus(v);
          reset();
        }}
        options={[
          { value: "all", label: "Все" },
          { value: "open", label: "Идут" },
          { value: "posted", label: "Проведённые" },
          { value: "cancelled", label: "Отменённые" },
        ]}
      />

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(query.error)}
        />
      )}

      <Table<CountSessionOut>
        rowKey="inventory_count_session_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={columns}
        pagination={tablePagination(query.data?.total)}
        locale={{ emptyText: "Сессий пока нет" }}
      />

      <Modal
        title="Новая инвентаризация"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Открыть"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item
            name="count_date"
            label="Дата пересчёта"
            tooltip="Дата документов при закрытии: в этот день расхождение попадёт в отчёты и в себестоимость"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="warehouse_ids"
            label="Склады"
            tooltip="Обход помещения целиком — это несколько складов в одной сессии; при закрытии на каждый создаётся свой документ"
            rules={[{ required: true, message: "Выберите хотя бы один склад" }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="Какие склады считаем"
              loading={warehouses.isPending}
              options={warehouses.options}
            />
          </Form.Item>
          <Form.Item name="prefill" valuePropName="checked">
            <Checkbox>
              Заполнить лист позициями с остатком
            </Checkbox>
          </Form.Item>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Факт в листе остаётся пустым"
            description="Лист спрашивает «что на полке», а не подсказывает ответ: подставленное количество подтверждают не считая, и инвентаризация становится формальностью. Без галочки лист будет пустым — позиции добавятся по мере обхода."
          />
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
