/** «Должности и права»: справочник должностей и права, которые даёт должность.
 *
 * По ТЗ вкладки приложения сотрудника открываются по должностям, а исключения
 * для человека — в «Участники → Права» (запрет там главнее). Эффективные права
 * = роль ∪ должность ∪ разрешено лично − запрещено лично.
 *
 * Новая должность появляется в справочнике сама, когда её пишут в карточке
 * сотрудника. Опечатки («Страший Пекарь») объединяются в правильную строку:
 * люди и права переезжают, лишняя должность пропадает.
 *
 * Список и переименование — staff.manage, права должности — role.manage. */
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPosition,
  listCapabilities,
  listPositions,
  mergePosition,
  setPositionCapabilities,
  updatePosition,
  type CapabilityOut,
  type PositionOut,
} from "@/api/admin";
import { errorMessage } from "@/api/client";
import { useCan } from "@/auth/store";
import {
  capLabel,
  groupByPrefix,
  groupTitle,
  STAFF_APP_CAPABILITIES,
} from "@/pages/admin/labels";
import { ActiveTag } from "@/pages/staff/shared";

const APP_CAPS = new Set<string>(STAFF_APP_CAPABILITIES);

function labelOf(key: string, caps: CapabilityOut[]): string {
  const cap = caps.find((c) => c.key === key);
  return cap ? capLabel(cap) : key;
}

export default function PositionsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canStaff = useCan("staff.manage");
  const canRoles = useCan("role.manage");

  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergeInto, setMergeInto] = useState<number | null>(null);
  const [draftCaps, setDraftCaps] = useState<string[]>([]);
  const [createForm] = Form.useForm<{ name: string }>();
  const [renameForm] = Form.useForm<{ name: string }>();

  const positionsQuery = useQuery({
    queryKey: ["positions", { includeInactive }],
    queryFn: () => listPositions(includeInactive),
  });
  const capsQuery = useQuery({
    queryKey: ["capabilities"],
    queryFn: listCapabilities,
    staleTime: 60_000,
  });
  const allCaps = capsQuery.data ?? [];

  const selected = positionsQuery.data?.find((p) => p.position_id === selectedId) ?? null;

  useEffect(() => {
    setDraftCaps(selected?.capabilities ?? []);
    setMergeInto(null);
  }, [selected?.position_id, selected?.capabilities]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["positions"] });
    queryClient.invalidateQueries({ queryKey: ["member-capabilities"] });
  }

  const create = useMutation({
    mutationFn: (name: string) => createPosition(name),
    onSuccess: (row) => {
      message.success("Должность добавлена");
      setCreateOpen(false);
      refresh();
      setSelectedId(row.position_id);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const rename = useMutation({
    mutationFn: (name: string) => updatePosition(selectedId as number, { name }),
    onSuccess: () => {
      message.success("Переименовано — подпись обновлена и в карточках сотрудников");
      setRenameOpen(false);
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => updatePosition(selectedId as number, { is_active: isActive }),
    onSuccess: (row) => {
      message.success(row.is_active ? "Должность снова в списке" : "Должность скрыта из списка");
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const merge = useMutation({
    mutationFn: (into: number) => mergePosition(selectedId as number, into),
    onSuccess: (row) => {
      message.success(`Объединено с «${row.name}»`);
      refresh();
      setSelectedId(row.position_id);
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const saveCaps = useMutation({
    mutationFn: () => setPositionCapabilities(selectedId as number, draftCaps),
    onSuccess: () => {
      message.success("Права должности сохранены");
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const otherGroups = useMemo(
    () => groupByPrefix(allCaps.filter((c) => !APP_CAPS.has(c.key))),
    [allCaps],
  );
  const appCaps = useMemo(
    () => STAFF_APP_CAPABILITIES.filter((k) => allCaps.some((c) => c.key === k)),
    [allCaps],
  );
  const draftSet = new Set(draftCaps);
  const dirty =
    selected != null &&
    [...draftSet].sort().join(",") !== [...selected.capabilities].sort().join(",");

  function toggleCap(key: string, checked: boolean) {
    setDraftCaps((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  const columns: ColumnsType<PositionOut> = [
    { title: "Должность", dataIndex: "name" },
    { title: "Сотрудников", dataIndex: "employee_count", width: 120 },
    {
      title: "Приложение сотрудника",
      key: "app",
      render: (_, row) => {
        const app = row.capabilities.filter((c) => APP_CAPS.has(c));
        if (app.length === 0) return <Typography.Text type="secondary">только общие вкладки</Typography.Text>;
        return app.map((c) => (
          <Tag key={c} color="blue">
            {labelOf(c, allCaps)}
          </Tag>
        ));
      },
    },
    {
      title: "Другие права",
      key: "other",
      width: 130,
      render: (_, row) => row.capabilities.filter((c) => !APP_CAPS.has(c)).length || "—",
    },
    {
      title: "Статус",
      dataIndex: "is_active",
      width: 120,
      render: (v: boolean) => <ActiveTag active={v} />,
    },
  ];

  const mergeOptions = (positionsQuery.data ?? [])
    .filter((p) => p.position_id !== selectedId)
    .map((p) => ({ value: p.position_id, label: `${p.name} (${p.employee_count})` }));

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Должности и права</h2>
        {canStaff && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              setCreateOpen(true);
            }}
          >
            Добавить должность
          </Button>
        )}
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Права должности добавляются к правам роли"
        description={
          <>
            Здесь открываются вкладки приложения сотрудника: склад, сборка, инвентаризация,
            «Мой цех». Исключение для конкретного человека — в «Участники → Права», запрет там
            главнее. Новая должность появляется сама, когда её пишут в карточке сотрудника;
            опечатки объединяйте с правильной должностью.
          </>
        }
      />

      <Checkbox
        style={{ marginBottom: 16 }}
        checked={includeInactive}
        onChange={(e) => setIncludeInactive(e.target.checked)}
      >
        Показывать скрытые
      </Checkbox>

      <Table
        rowKey="position_id"
        size="small"
        loading={positionsQuery.isPending}
        dataSource={positionsQuery.data}
        pagination={false}
        columns={columns}
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => setSelectedId(row.position_id) })}
      />

      <Drawer
        open={selected != null}
        onClose={() => setSelectedId(null)}
        width={600}
        title={selected?.name}
        destroyOnClose
        extra={
          canStaff && selected ? (
            <Space>
              <Button
                onClick={() => {
                  renameForm.setFieldsValue({ name: selected.name });
                  setRenameOpen(true);
                }}
              >
                Переименовать
              </Button>
              <Button
                loading={toggleActive.isPending}
                onClick={() => toggleActive.mutate(!selected.is_active)}
              >
                {selected.is_active ? "Скрыть" : "Вернуть в список"}
              </Button>
            </Space>
          ) : undefined
        }
      >
        {selected && (
          <>
            <Typography.Paragraph type="secondary">
              Действующих сотрудников: {selected.employee_count}
            </Typography.Paragraph>

            <Typography.Title level={5}>Приложение сотрудника</Typography.Title>
            {!canRoles && (
              <Typography.Paragraph type="secondary">
                Менять права может только тот, у кого есть право «Управление ролями».
              </Typography.Paragraph>
            )}
            {appCaps.map((key) => (
              <div key={key} style={{ padding: "4px 0" }}>
                <Checkbox
                  checked={draftSet.has(key)}
                  disabled={!canRoles}
                  onChange={(e) => toggleCap(key, e.target.checked)}
                >
                  {labelOf(key, allCaps)}
                </Checkbox>
              </div>
            ))}

            <Collapse
              style={{ marginTop: 16 }}
              size="small"
              items={[
                {
                  key: "other",
                  label: "Прочие права (кабинет)",
                  children: otherGroups.map(([prefix, caps]) => (
                    <div key={prefix} style={{ marginBottom: 12 }}>
                      <Typography.Text strong>{groupTitle(prefix)}</Typography.Text>
                      {caps.map((cap) => (
                        <div key={cap.key} style={{ padding: "2px 0" }}>
                          <Checkbox
                            checked={draftSet.has(cap.key)}
                            disabled={!canRoles}
                            onChange={(e) => toggleCap(cap.key, e.target.checked)}
                          >
                            {capLabel(cap)}
                          </Checkbox>
                        </div>
                      ))}
                    </div>
                  )),
                },
              ]}
            />

            {canRoles && (
              <Space style={{ marginTop: 16 }}>
                <Button
                  type="primary"
                  disabled={!dirty}
                  loading={saveCaps.isPending}
                  onClick={() => saveCaps.mutate()}
                >
                  Сохранить права
                </Button>
                {dirty && (
                  <Button onClick={() => setDraftCaps(selected.capabilities)}>Отменить</Button>
                )}
              </Space>
            )}

            {canStaff && (
              <>
                <Typography.Title level={5} style={{ marginTop: 32 }}>
                  Объединить с другой должностью
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  Для опечаток и дублей: сотрудники «{selected.name}» перейдут в выбранную
                  должность, права объединятся, эта строка удалится.
                </Typography.Paragraph>
                <Space.Compact style={{ width: "100%" }}>
                  <Select
                    style={{ flex: 1 }}
                    showSearch
                    optionFilterProp="label"
                    placeholder="Правильная должность"
                    value={mergeInto ?? undefined}
                    onChange={(v) => setMergeInto(v)}
                    options={mergeOptions}
                  />
                  <Popconfirm
                    title="Объединить должности?"
                    description="Отменить это действие нельзя."
                    okText="Объединить"
                    cancelText="Отмена"
                    disabled={mergeInto == null}
                    onConfirm={() => mergeInto != null && merge.mutate(mergeInto)}
                  >
                    <Button disabled={mergeInto == null} loading={merge.isPending}>
                      Объединить
                    </Button>
                  </Popconfirm>
                </Space.Compact>
              </>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title="Новая должность"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={create.isPending}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => create.mutate(v.name)}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, whitespace: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Переименовать должность"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={() => renameForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={rename.isPending}
        destroyOnClose
      >
        <Form form={renameForm} layout="vertical" onFinish={(v) => rename.mutate(v.name)}>
          <Form.Item
            name="name"
            label="Название"
            extra="Новое название попадёт и в карточки сотрудников этой должности"
            rules={[{ required: true, whitespace: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
