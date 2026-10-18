/** «Журнал инструктажей»: кто, когда, какую версию подписал и с каким
 * результатом — с листом ознакомления в PDF и выгрузкой в Excel; на второй
 * вкладке — кто ещё не прошёл (ТЗ, §19).
 *
 * Журнал только дописывается: запись не правится и не удаляется, имена в нём
 * — как были на момент подписи. */
import { App, Button, Input, Segmented, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  ASSIGNMENT_REASON_LABELS,
  downloadBriefingJournal,
  listBriefingAssignments,
  listBriefingJournal,
  listBriefings,
  type AssignmentFilter,
  type JournalEntry,
} from "@/api/onboarding";
import { listDepartments } from "@/api/staff";
import { fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { useTabParam } from "@/components/useTabParam";
import { ReportRangePicker, useReportRange } from "@/pages/finance/reportRange";
import { ASSIGNMENT_FILTERS, assignmentColumns } from "@/pages/staff/BriefingDetailPage";

function useBriefingOptions() {
  const q = useQuery({ queryKey: ["briefings", true], queryFn: () => listBriefings(true), staleTime: 60_000 });
  return (q.data ?? []).map((b) => ({ value: b.briefing_id, label: b.title }));
}

function JournalTab() {
  const { message } = App.useApp();
  const { limit, offset, tablePagination, reset } = usePagination(50);
  const { range, setRange, params: period } = useReportRange();
  const [briefingId, setBriefingId] = useState<number | undefined>();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const briefings = useBriefingOptions();
  const filters = { ...period, briefing_id: briefingId, q: q || undefined };
  const query = useQuery({
    queryKey: ["briefing-journal", filters, limit, offset],
    queryFn: () => listBriefingJournal({ ...filters, limit, offset }),
  });

  const columns: ColumnsType<JournalEntry> = [
    { title: "№", dataIndex: "journal_id", width: 70 },
    { title: "Когда", dataIndex: "confirmed_at", width: 140, render: (v) => fmtDateTime(v) },
    {
      title: "Сотрудник",
      dataIndex: "employee_name",
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {[r.position_name, r.department_name].filter(Boolean).join(" · ") || "—"}
          </Typography.Text>
        </Space>
      ),
    },
    { title: "Инструктаж", dataIndex: "briefing_title", render: (v, r) => `${v} · в.${r.version_number}` },
    { title: "Вид", dataIndex: "reason", width: 120, render: (v) => ASSIGNMENT_REASON_LABELS[v] ?? v },
    {
      title: "Результат",
      dataIndex: "block_scores",
      render: (scores: JournalEntry["block_scores"]) => (
        <Space size={[4, 4]} wrap>
          {scores.map((s) => (
            <Tag key={s.block_id}>{s.title}: {s.score_percent ?? "—"}%</Tag>
          ))}
        </Space>
      ),
    },
    { title: "Подпись", dataIndex: "sign_method", width: 100, render: (v) => (v === "password" ? "паролем" : v) },
    {
      title: "",
      dataIndex: "sheet_pdf_url",
      width: 110,
      render: (v: string | null) => (v ? <a href={v} target="_blank" rel="noreferrer">Лист (PDF)</a> : null),
    },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <ReportRangePicker value={range} onChange={(r) => { setRange(r); reset(); }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Все инструктажи" style={{ width: 240 }}
          value={briefingId} onChange={(v) => { setBriefingId(v); reset(); }} options={briefings} />
        <Input.Search allowClear placeholder="Сотрудник или инструктаж" style={{ width: 240 }}
          onSearch={(v) => { setQ(v.trim()); reset(); }} />
        <Button
          icon={<DownloadOutlined />}
          loading={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadBriefingJournal(filters);
            } catch (e) {
              message.error(errorMessage(e));
            } finally {
              setExporting(false);
            }
          }}
        >
          Excel
        </Button>
      </Space>
      <Table
        rowKey="journal_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={columns}
        pagination={tablePagination(query.data?.total)}
        scroll={{ x: 1100 }}
        locale={{ emptyText: "За период никто не подписывал" }}
      />
    </>
  );
}

function PendingTab() {
  const { limit, offset, tablePagination, reset } = usePagination(50);
  const [status, setStatus] = useState<AssignmentFilter>("open");
  const [briefingId, setBriefingId] = useState<number | undefined>();
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const briefings = useBriefingOptions();
  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const params = { limit, offset, status, briefing_id: briefingId, department_id: departmentId };
  const query = useQuery({
    queryKey: ["briefing-assignments", params],
    queryFn: () => listBriefingAssignments(params),
  });
  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented value={status} options={ASSIGNMENT_FILTERS}
          onChange={(v) => { setStatus(v as AssignmentFilter); reset(); }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Все инструктажи" style={{ width: 220 }}
          value={briefingId} onChange={(v) => { setBriefingId(v); reset(); }} options={briefings} />
        <Select allowClear placeholder="Все цеха" style={{ width: 200 }} value={departmentId}
          onChange={(v) => { setDepartmentId(v); reset(); }}
          options={(departments.data?.items ?? []).filter((d) => d.is_active)
            .map((d) => ({ value: d.department_id, label: d.name }))} />
      </Space>
      <Table
        rowKey="assignment_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={assignmentColumns({ briefing: true })}
        pagination={tablePagination(query.data?.total)}
        scroll={{ x: 1100 }}
        locale={{ emptyText: "Никого" }}
      />
    </>
  );
}

export default function BriefingJournalPage() {
  const [tab, setTab] = useTabParam("journal", ["journal", "pending"]);
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Журнал инструктажей</h2>
      <Typography.Paragraph type="secondary">
        Запись появляется, когда сотрудник сдал тест и подписал инструктаж паролем в приложении. Её
        нельзя изменить или удалить; к каждой — лист ознакомления в PDF.
      </Typography.Paragraph>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "journal", label: "Журнал", children: <JournalTab /> },
          { key: "pending", label: "Кто не прошёл", children: <PendingTab /> },
        ]}
      />
    </div>
  );
}
