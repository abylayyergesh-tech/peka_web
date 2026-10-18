/** Вкладка «Онбординг» в личном деле: где сотрудник в онбординге, согласие,
 * эталонное фото, инструктажи по ТБ и сброс (перевод в другой цех). */
import { App, Button, Descriptions, Image, Popconfirm, Space, Spin, Table, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  getEmployeeOnboarding,
  listEmployeeBriefings,
  resetEmployeeOnboarding,
} from "@/api/onboarding";
import { fmtDate, fmtDateTime } from "@/components/format";
import { assignmentColumns } from "@/pages/staff/BriefingDetailPage";
import { OnboardingStatusTag } from "@/pages/staff/OnboardingPage";

export default function OnboardingTab({ employeeId, canManage }: { employeeId: number; canManage: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ["employee-onboarding", employeeId],
    queryFn: () => getEmployeeOnboarding(employeeId),
  });
  const briefings = useQuery({
    queryKey: ["employee-briefings", employeeId],
    queryFn: () => listEmployeeBriefings(employeeId),
  });
  const reset = useMutation({
    mutationFn: () => resetEmployeeOnboarding(employeeId),
    onSuccess: (data) => {
      queryClient.setQueryData(["employee-onboarding", employeeId], data);
      queryClient.invalidateQueries({ queryKey: ["onboarding-employees"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      message.success("Онбординг сброшен");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  if (state.isPending || !state.data) return <Spin />;
  const s = state.data;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Статус"><OnboardingStatusTag row={s} /></Descriptions.Item>
        <Descriptions.Item label="Отметка прихода">
          {s.clock_allowed
            ? s.grace_until && s.status !== "completed"
              ? `открыта до ${fmtDate(s.grace_until)} (переходный период)`
              : "открыта"
            : "закрыта до конца онбординга или инструктажа"}
        </Descriptions.Item>
        <Descriptions.Item label="Согласие на фото и геолокацию">
          {s.consent_accepted_at ? `${fmtDateTime(s.consent_accepted_at)}, версия ${s.consent_version}` : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Эталонное фото">
          {s.reference_photo_url
            ? <Image src={s.reference_photo_url} width={72} height={96} style={{ objectFit: "cover" }} />
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Прошёл">{fmtDateTime(s.completed_at)}</Descriptions.Item>
        {s.reset_at && <Descriptions.Item label="Сброшен">{fmtDateTime(s.reset_at)}</Descriptions.Item>}
      </Descriptions>

      {canManage && s.status !== "not_launched" && (
        <Popconfirm
          title="Сбросить онбординг?"
          description="Сотрудник пройдёт его заново, сразу: отметка закроется до конца онбординга. Инструктаж на рабочем месте тоже сбросится."
          okText="Сбросить"
          cancelText="Отмена"
          okButtonProps={{ danger: true }}
          onConfirm={() => reset.mutate()}
        >
          <Button danger loading={reset.isPending}>Сбросить онбординг</Button>
        </Popconfirm>
      )}

      <div>
        <Typography.Title level={5}>Инструктажи по ТБ</Typography.Title>
        <Table
          rowKey="assignment_id"
          size="small"
          pagination={false}
          loading={briefings.isPending}
          dataSource={briefings.data}
          // Сотрудник и так понятен — это его личное дело.
          columns={assignmentColumns({ briefing: true })
            .filter((c) => (c as { dataIndex?: string }).dataIndex !== "employee_name")}
          scroll={{ x: 900 }}
          locale={{ emptyText: "Инструктажей не назначено" }}
        />
      </div>
    </Space>
  );
}
