/** Вкладка «Приложение» в личном деле: как сотрудник входит в приложение и
 * какой телефон к нему привязан.
 *
 * Правило ТЗ — «один аккаунт — один телефон». Первый вход с приложения
 * привязывает телефон; вход с другого ждёт решения руководителя цеха или HR.
 * Сброс нужен, когда телефон потерян или сменён без старого: старый
 * отрезается сразу, следующий вход становится первой привязкой. */
import { App, Button, Descriptions, Empty, Popconfirm, Space, Spin, Switch, Table, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  decideDeviceRequest,
  getEmployeeDevices,
  resetEmployeeDevice,
  updateEmployee,
  type DeviceOut,
  type EmployeeOut,
} from "@/api/staff";
import { fmtDateTime } from "@/components/format";

export function deviceLabel(d: {
  model?: string | null;
  device_model?: string | null;
  platform: string | null;
  os: string | null;
}): string {
  const model = d.model ?? d.device_model ?? "Телефон";
  const platform = d.os || (d.platform === "ios" ? "iOS" : d.platform === "android" ? "Android" : null);
  return platform ? `${model} · ${platform}` : model;
}

const REASON_LABELS: Record<string, string> = {
  replaced: "заменён новым",
  reset: "сброшен HR",
};

export default function AppAccessTab({
  employee,
  canManage,
  onEmployeePatched,
}: {
  employee: EmployeeOut;
  canManage: boolean;
  onEmployeePatched?: (row: EmployeeOut) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const id = employee.employee_id;
  const key = ["employee-devices", id];

  const query = useQuery({ queryKey: key, queryFn: () => getEmployeeDevices(id) });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["device-requests"] });
  }

  const reset = useMutation({
    mutationFn: () => resetEmployeeDevice(id),
    onSuccess: (data) => {
      message.success("Телефон сброшен: следующий вход из приложения привяжет новый");
      queryClient.setQueryData(key, data);
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const decide = useMutation({
    mutationFn: (v: { requestId: number; decision: "approve" | "reject" }) =>
      decideDeviceRequest(v.requestId, v.decision),
    onSuccess: (_, v) => {
      message.success(v.decision === "approve" ? "Новый телефон подтверждён" : "Запрос отклонён");
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const exempt = useMutation({
    mutationFn: (value: boolean) => updateEmployee(id, { device_binding_exempt: value }),
    onSuccess: (row) => {
      message.success(row.device_binding_exempt ? "Привязка телефона отключена" : "Привязка телефона включена");
      onEmployeePatched?.(row);
      refresh();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const logins = [
    employee.personnel_no ? `табельный номер ${employee.personnel_no}` : null,
    employee.phone ? `телефон ${employee.phone}` : null,
    employee.user_email && !employee.user_email.endsWith(".local") ? employee.user_email : null,
  ].filter(Boolean);

  if (query.isPending) return <Spin />;
  const data = query.data;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="Логин">
          {logins.length > 0 ? (
            logins.join(" или ")
          ) : (
            <Typography.Text type="warning">
              Укажите табельный номер или телефон — по ним сотрудник входит в приложение
            </Typography.Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Пароль">
          Выдаёт администрация: «Участники» → «Пароль». Восстановления по почте у цеха нет.
        </Descriptions.Item>
        {employee.status === "terminated" && (
          <Descriptions.Item label="Доступ">
            <Tag color="red">Отключён — сотрудник уволен</Tag>
          </Descriptions.Item>
        )}
      </Descriptions>

      <div>
        <Typography.Title level={5}>Телефон</Typography.Title>
        {data?.device_binding_exempt ? (
          <Typography.Paragraph type="secondary">
            Привязка отключена: можно входить с любого телефона.
          </Typography.Paragraph>
        ) : data?.active ? (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Привязан">{deviceLabel(data.active)}</Descriptions.Item>
            <Descriptions.Item label="Версия приложения">
              {data.active.app_version || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="С какого времени">{fmtDateTime(data.active.bound_at)}</Descriptions.Item>
            <Descriptions.Item label="Последний вход">
              {fmtDateTime(data.active.last_seen_at)}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Телефон не привязан — привяжется при первом входе из приложения"
          />
        )}
      </div>

      {data?.pending && (
        <div>
          <Typography.Title level={5}>Запрос на смену телефона</Typography.Title>
          <Typography.Paragraph>
            Вход с <b>{deviceLabel(data.pending)}</b> — {fmtDateTime(data.pending.requested_at)}.
            {data.pending.current_device_model && <> Сейчас привязан {data.pending.current_device_model}.</>}
          </Typography.Paragraph>
          {canManage && (
            <Space>
              <Popconfirm
                title="Подтвердить новый телефон?"
                description="Старый телефон сразу перестанет работать."
                okText="Подтвердить"
                cancelText="Отмена"
                onConfirm={() =>
                  decide.mutate({ requestId: data.pending!.request_id, decision: "approve" })
                }
              >
                <Button type="primary" loading={decide.isPending}>
                  Подтвердить
                </Button>
              </Popconfirm>
              <Button
                loading={decide.isPending}
                onClick={() => decide.mutate({ requestId: data.pending!.request_id, decision: "reject" })}
              >
                Отклонить
              </Button>
            </Space>
          )}
        </div>
      )}

      {canManage && (
        <Space direction="vertical">
          {data?.active && (
            <Popconfirm
              title="Сбросить привязку телефона?"
              description="Текущий телефон сразу перестанет работать. Следующий вход из приложения привяжет новый."
              okText="Сбросить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => reset.mutate()}
            >
              <Button danger loading={reset.isPending}>
                Сбросить телефон
              </Button>
            </Popconfirm>
          )}
          <Space>
            <Switch
              checked={data?.device_binding_exempt ?? false}
              loading={exempt.isPending}
              onChange={(v) => exempt.mutate(v)}
            />
            <span>Без привязки телефона</span>
            <Typography.Text type="secondary">
              — для тестового аккаунта (проверка в App Store) или общего телефона
            </Typography.Text>
          </Space>
        </Space>
      )}

      {(data?.history.length ?? 0) > 0 && (
        <div>
          <Typography.Title level={5}>Прежние телефоны</Typography.Title>
          <Table<DeviceOut>
            rowKey="employee_device_id"
            size="small"
            pagination={false}
            dataSource={data?.history}
            columns={[
              { title: "Телефон", render: (_, d) => deviceLabel(d) },
              { title: "Привязан", dataIndex: "bound_at", render: (v) => fmtDateTime(v) },
              { title: "Отвязан", dataIndex: "deactivated_at", render: (v) => fmtDateTime(v) },
              {
                title: "Причина",
                dataIndex: "deactivation_reason",
                render: (v: string | null) => (v ? REASON_LABELS[v] ?? v : "—"),
              },
            ]}
          />
        </div>
      )}
    </Space>
  );
}
