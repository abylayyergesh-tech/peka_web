/** «Наши юр. лица» в карточке поставщика: кому он поставляет и сколько мы
 * должны ему по каждому юрлицу.
 *
 * Список задан — накладные, заказы и платежи этого поставщика оформляются
 * только на эти юрлица (без выбора — на юрлицо «по умолчанию»). Пусто —
 * поставщик не ограничен. */
import { EditOutlined } from "@ant-design/icons";
import { App, Button, Card, Empty, Modal, Radio, Select, Space, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getSupplierBalances, setSupplierCompanies,
  type SupplierCompanyBalance, type SupplierOut,
} from "@/api/procurement";
import { useCan } from "@/auth/store";
import { Money } from "@/components/format";
import { NO_ENTITY_LABEL, useCompanyEntities } from "@/pages/finance/companyEntities";

export default function SupplierCompaniesCard({ supplier }: { supplier: SupplierOut }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("supplier.manage");
  const canReport = useCan("report.read");
  const entities = useCompanyEntities();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [defaultId, setDefaultId] = useState<number | null>(null);

  const balances = useQuery({
    queryKey: ["supplier-balances", supplier.supplier_id],
    queryFn: () => getSupplierBalances(supplier.supplier_id),
    enabled: canReport,
  });

  const save = useMutation({
    mutationFn: () =>
      setSupplierCompanies(
        supplier.supplier_id,
        selected.map((id) => ({ company_entity_id: id, is_default: id === defaultId })),
      ),
    onSuccess: () => {
      message.success("Юр. лица поставщика сохранены");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["supplier", supplier.supplier_id] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const links = supplier.company_entities ?? [];
  function edit() {
    setSelected(links.map((l) => l.company_entity_id));
    setDefaultId(links.find((l) => l.is_default)?.company_entity_id ?? null);
    setOpen(true);
  }

  const columns = [
    {
      title: "Наше юр. лицо",
      dataIndex: "company_entity_name",
      render: (v: string | null) => v ?? NO_ENTITY_LABEL,
    },
    {
      title: "Получено",
      dataIndex: "total_received",
      align: "right" as const,
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Оплачено",
      dataIndex: "total_paid",
      align: "right" as const,
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Долг",
      dataIndex: "balance",
      align: "right" as const,
      render: (v: string) => (
        <b style={{ color: Number(v) > 0 ? "#cf1322" : Number(v) < 0 ? "#389e0d" : undefined }}>
          <Money value={v} />
        </b>
      ),
    },
  ];

  return (
    <Card
      size="small"
      className="no-print"
      title="Наши юр. лица"
      style={{ marginBottom: 24 }}
      extra={canManage && (
        <Button size="small" icon={<EditOutlined />} onClick={edit}>
          Изменить
        </Button>
      )}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        {links.length === 0 ? (
          <Typography.Text type="secondary">
            Не ограничен: накладные и платежи можно оформить на любое наше юр. лицо
          </Typography.Text>
        ) : (
          links.map((l) => (
            <Tag key={l.company_entity_id} color={l.is_default ? "blue" : undefined}>
              {l.name}{l.is_default ? " · по умолчанию" : ""}
            </Tag>
          ))
        )}
      </Space>
      {canReport && (
        <Table<SupplierCompanyBalance>
          size="small"
          rowKey={(r) => String(r.company_entity_id ?? "none")}
          loading={balances.isPending}
          dataSource={balances.data ?? []}
          columns={columns}
          pagination={false}
          locale={{ emptyText: <Empty description="Расчётов с поставщиком ещё не было" /> }}
        />
      )}
      <Modal
        open={open}
        title="Каким нашим юр. лицам поставляет"
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        onOk={() => save.mutate()}
        onCancel={() => setOpen(false)}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Накладные, заказы и платежи этого поставщика будут оформляться только на выбранные
          юр. лица. Пустой список — без ограничений.
        </Typography.Paragraph>
        <Select
          mode="multiple"
          style={{ width: "100%", marginBottom: 12 }}
          placeholder="Юр. лица"
          value={selected}
          onChange={(ids: number[]) => {
            setSelected(ids);
            if (defaultId != null && !ids.includes(defaultId)) setDefaultId(ids[0] ?? null);
            if (defaultId == null && ids.length > 0) setDefaultId(ids[0]);
          }}
          options={(entities.data ?? []).map((e) => ({ value: e.company_entity_id, label: e.name }))}
        />
        {selected.length > 1 && (
          <>
            <Typography.Text>По умолчанию:</Typography.Text>
            <Radio.Group
              style={{ display: "flex", flexDirection: "column", marginTop: 6 }}
              value={defaultId}
              onChange={(e) => setDefaultId(e.target.value)}
              options={selected.map((id) => ({
                value: id,
                label: entities.data?.find((x) => x.company_entity_id === id)?.name ?? `#${id}`,
              }))}
            />
          </>
        )}
      </Modal>
    </Card>
  );
}
