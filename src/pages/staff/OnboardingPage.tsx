/** «Онбординг»: что новичок проходит в приложении до первой отметки —
 * приветствие, согласие на фото и геолокацию, обзор, эталонное селфи,
 * инструктажи по ТБ и подпись (ТЗ, §5).
 *
 * Пока онбординг не запущен, приложение его не показывает и отметку не
 * запирает: HR сначала готовит тексты и инструктажи, потом нажимает
 * «Запустить». Кто работал до запуска, получает переходный период из «Правил
 * учёта»; новичок отмечается только после онбординга. */
import {
  Alert, App, Button, Card, Col, Form, Image, Input, Popconfirm, Row, Segmented, Select,
  Space, Table, Tabs, Tag, Typography,
} from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  ONBOARDING_STEP_LABELS,
  getOnboardingSettings,
  launchOnboarding,
  listOnboardingEmployees,
  resetEmployeeOnboarding,
  saveOnboardingSettings,
  stopOnboarding,
  type EmployeeOnboarding,
  type OnboardingSettings,
  type OnboardingSettingsIn,
} from "@/api/onboarding";
import { listDepartments } from "@/api/staff";
import { useCan } from "@/auth/store";
import { fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { useTabParam } from "@/components/useTabParam";

export function OnboardingStatusTag({ row }: { row: EmployeeOnboarding }) {
  if (row.status === "not_launched") return <Tag>не запущен</Tag>;
  if (row.status === "completed") return <Tag color="green">прошёл</Tag>;
  if (row.status === "not_started") return <Tag color="orange">не начинал</Tag>;
  return <Tag color="blue">{ONBOARDING_STEP_LABELS[row.current_step ?? ""] ?? "идёт"}</Tag>;
}

function LaunchCard({ settings }: { settings: OnboardingSettings }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const onDone = (data: OnboardingSettings, text: string) => {
    queryClient.setQueryData(["onboarding-settings"], data);
    queryClient.invalidateQueries({ queryKey: ["onboarding-employees"] });
    message.success(text);
  };
  const launch = useMutation({
    mutationFn: launchOnboarding,
    onSuccess: (d) => onDone(d, "Онбординг запущен"),
    onError: (e) => message.error(errorMessage(e)),
  });
  const stop = useMutation({
    mutationFn: stopOnboarding,
    onSuccess: (d) => onDone(d, "Онбординг остановлен"),
    onError: (e) => message.error(errorMessage(e)),
  });

  if (!settings.launched_at) {
    return (
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Онбординг не запущен"
        description={
          <Space direction="vertical">
            <span>
              Приложение его не показывает, отметка открыта всем. Подготовьте тексты на вкладке
              «Тексты приложения» и инструктажи в <Link to="/briefings">«Инструктажах по ТБ»</Link>,
              затем запустите.
            </span>
            {canManage && (
              <Button
                type="primary"
                loading={launch.isPending}
                onClick={() =>
                  modal.confirm({
                    title: "Запустить онбординг?",
                    content: (
                      <>
                        <p>
                          Работающие сейчас сотрудники смогут отмечаться ещё {settings.grace_days} дн.,
                          приложение будет предлагать пройти онбординг.
                        </p>
                        <p>Новые сотрудники смогут отметить приход только после онбординга.</p>
                      </>
                    ),
                    okText: "Запустить",
                    cancelText: "Отмена",
                    onOk: () => launch.mutateAsync(),
                  })
                }
              >
                Запустить онбординг
              </Button>
            )}
          </Space>
        }
      />
    );
  }
  const graceEnd = dayjs(settings.launched_at).add(settings.grace_days, "day");
  return (
    <Alert
      type="success"
      showIcon
      style={{ marginBottom: 16 }}
      message={`Онбординг запущен ${fmtDateTime(settings.launched_at)}`}
      description={
        <Space direction="vertical">
          <span>
            Новички отмечаются только после онбординга. Работавшие до запуска — переходный период
            до {graceEnd.format("DD.MM.YYYY")}; после него отметка закроется, пока не пройдут.
          </span>
          {canManage && (
            <Popconfirm
              title="Остановить онбординг?"
              description="Приложение перестанет его показывать и запирать отметку. Пройденное сохранится."
              okText="Остановить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => stop.mutate()}
            >
              <Button danger loading={stop.isPending}>Остановить</Button>
            </Popconfirm>
          )}
        </Space>
      }
    />
  );
}

function PeopleTab() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const { limit, offset, tablePagination, reset } = usePagination(50);
  const [status, setStatus] = useState<"pending" | "completed" | "all">("pending");
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [q, setQ] = useState("");

  const params = {
    limit, offset, department_id: departmentId, q: q || undefined,
    status: status === "all" ? undefined : status,
  };
  const query = useQuery({
    queryKey: ["onboarding-employees", params],
    queryFn: () => listOnboardingEmployees(params),
  });
  const departments = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const resetM = useMutation({
    mutationFn: resetEmployeeOnboarding,
    onSuccess: () => {
      message.success("Онбординг сброшен");
      queryClient.invalidateQueries({ queryKey: ["onboarding-employees"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<EmployeeOnboarding> = [
    { title: "Сотрудник", dataIndex: "full_name", render: (v, r) => (
      <Space direction="vertical" size={0}>
        <span>{v}</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {[r.position, r.department_name].filter(Boolean).join(" · ") || "—"}
        </Typography.Text>
      </Space>
    ) },
    { title: "Статус", key: "status", width: 150, render: (_, r) => <OnboardingStatusTag row={r} /> },
    {
      title: "Отметка",
      dataIndex: "clock_allowed",
      width: 160,
      render: (v: boolean, r) =>
        v ? (
          r.grace_until && r.status !== "completed" ? (
            <Tag color="gold">открыта до {fmtDate(r.grace_until)}</Tag>
          ) : (
            <Tag color="green">открыта</Tag>
          )
        ) : (
          <Tag color="red">закрыта</Tag>
        ),
    },
    {
      title: "Согласие",
      dataIndex: "consent_accepted_at",
      width: 150,
      render: (v: string | null, r) => (v ? `${fmtDate(v)} · версия ${r.consent_version}` : "—"),
    },
    {
      title: "Эталонное фото",
      dataIndex: "reference_photo_url",
      width: 120,
      render: (v: string | null) =>
        v ? <Image src={v} width={40} height={52} style={{ objectFit: "cover" }} /> : "—",
    },
    { title: "Инструктажи", dataIndex: "open_briefings", width: 120,
      render: (v: number) => (v ? <Tag color="orange">не подписано: {v}</Tag> : "—") },
    { title: "Прошёл", dataIndex: "completed_at", width: 110, render: (v) => fmtDate(v) },
    ...(canManage
      ? ([{
          title: "",
          key: "act",
          width: 110,
          render: (_: unknown, r: EmployeeOnboarding) =>
            r.status === "not_launched" ? null : (
              <Popconfirm
                title="Сбросить онбординг?"
                description="Сотрудник пройдёт его заново, сразу: отметка закроется до конца онбординга. Инструктаж на рабочем месте тоже сбросится."
                okText="Сбросить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                onConfirm={() => resetM.mutate(r.employee_id)}
              >
                <a>Сбросить</a>
              </Popconfirm>
            ),
        }] as ColumnsType<EmployeeOnboarding>)
      : []),
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={status}
          onChange={(v) => { setStatus(v as typeof status); reset(); }}
          options={[
            { value: "pending", label: "Не прошли" },
            { value: "completed", label: "Прошли" },
            { value: "all", label: "Все" },
          ]}
        />
        <Select
          allowClear
          placeholder="Все цеха"
          style={{ width: 220 }}
          value={departmentId}
          onChange={(v) => { setDepartmentId(v); reset(); }}
          options={(departments.data?.items ?? []).filter((d) => d.is_active)
            .map((d) => ({ value: d.department_id, label: d.name }))}
        />
        <Input.Search allowClear placeholder="ФИО" style={{ width: 220 }}
          onSearch={(v) => { setQ(v.trim()); reset(); }} />
      </Space>
      <Table
        rowKey="employee_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        columns={columns}
        pagination={tablePagination(query.data?.total)}
        scroll={{ x: 1000 }}
      />
    </>
  );
}

const PAIRS: { ru: keyof OnboardingSettingsIn; kk: keyof OnboardingSettingsIn; label: string;
  area?: boolean; placeholder: keyof OnboardingSettings }[] = [
  { ru: "welcome_title_ru", kk: "welcome_title_kk", label: "Заголовок приветствия",
    placeholder: "default_welcome_title" },
  { ru: "welcome_text_ru", kk: "welcome_text_kk", label: "Текст приветствия", area: true,
    placeholder: "default_welcome_text" },
  { ru: "consent_text_ru", kk: "consent_text_kk", label: "Текст согласия на фото и геолокацию",
    area: true, placeholder: "default_consent_text" },
];

function TextsTab({ settings }: { settings: OnboardingSettings }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  const [form] = Form.useForm<OnboardingSettingsIn>();

  useEffect(() => {
    form.setFieldsValue({
      welcome_title_ru: settings.welcome_title_ru, welcome_title_kk: settings.welcome_title_kk,
      welcome_text_ru: settings.welcome_text_ru, welcome_text_kk: settings.welcome_text_kk,
      welcome_video_url: settings.welcome_video_url,
      consent_text_ru: settings.consent_text_ru, consent_text_kk: settings.consent_text_kk,
      cards: settings.cards,
    });
  }, [settings, form]);

  const save = useMutation({
    // Только поля карточки: служебный id API не принимает.
    mutationFn: (v: OnboardingSettingsIn) => saveOnboardingSettings({
      ...v,
      cards: (v.cards ?? []).map((c) => ({
        title_ru: c.title_ru, title_kk: c.title_kk ?? null, text_ru: c.text_ru ?? null,
        text_kk: c.text_kk ?? null, image_url: c.image_url ?? null,
      })),
    }),
    onSuccess: (data) => {
      queryClient.setQueryData(["onboarding-settings"], data);
      message.success(data.consent_version !== settings.consent_version
        ? `Сохранено. Текст согласия изменился — версия ${data.consent_version}`
        : "Тексты сохранены");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Form form={form} layout="vertical" disabled={!canManage} onFinish={(v) => save.mutate(v)}
      style={{ maxWidth: 1000 }}>
      <Typography.Paragraph type="secondary">
        Пустое поле — сотрудник увидит текст по умолчанию (он подсказан серым). Казахский можно не
        заполнять: тогда приложение покажет русский.
      </Typography.Paragraph>
      <Card size="small" title="Приветствие и согласие" style={{ marginBottom: 16 }}>
        {PAIRS.map((p) => (
          <Row gutter={12} key={p.ru}>
            {(["ru", "kk"] as const).map((lang) => (
              <Col xs={24} md={12} key={lang}>
                <Form.Item name={p[lang]} label={`${p.label} (${lang === "ru" ? "рус." : "каз."})`}>
                  {p.area ? (
                    <Input.TextArea rows={4}
                      placeholder={lang === "ru" ? String(settings[p.placeholder]) : "как на русском"} />
                  ) : (
                    <Input placeholder={lang === "ru" ? String(settings[p.placeholder]) : "как на русском"} />
                  )}
                </Form.Item>
              </Col>
            ))}
          </Row>
        ))}
        <Form.Item name="welcome_video_url" label="Видео приветствия (ссылка)"
          extra="Например, ролик на YouTube. Пусто — без видео.">
          <Input placeholder="https://…" />
        </Form.Item>
        <Typography.Text type="secondary">
          Версия согласия: {settings.consent_version}. Меняется сама, когда меняется текст согласия.
        </Typography.Text>
      </Card>

      <Card size="small" title="Карточки экрана «Обзор»" style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary">
          Короткие карточки о том, как пользоваться приложением. Нет ни одной — приложение покажет
          свои пять встроенных.
        </Typography.Paragraph>
        <Form.List name="cards">
          {(fields, { add, remove, move }) => (
            <Space direction="vertical" style={{ width: "100%" }}>
              {fields.map((f, i) => (
                <Card key={f.key} size="small" type="inner" title={`Карточка ${i + 1}`}
                  extra={canManage && (
                    <Space>
                      <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0}
                        onClick={() => move(i, i - 1)} />
                      <Button size="small" icon={<ArrowDownOutlined />} disabled={i === fields.length - 1}
                        onClick={() => move(i, i + 1)} />
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                    </Space>
                  )}>
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item name={[f.name, "title_ru"]} label="Заголовок (рус.)"
                        rules={[{ required: true, message: "Обязательное поле" }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name={[f.name, "title_kk"]} label="Заголовок (каз.)"><Input /></Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name={[f.name, "text_ru"]} label="Текст (рус.)"><Input.TextArea rows={2} /></Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name={[f.name, "text_kk"]} label="Текст (каз.)"><Input.TextArea rows={2} /></Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item name={[f.name, "image_url"]} label="Картинка (ссылка)">
                        <Input placeholder="https://…" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              ))}
              {canManage && fields.length < 20 && (
                <Button icon={<PlusOutlined />} onClick={() => add({ title_ru: "" })}>Добавить карточку</Button>
              )}
            </Space>
          )}
        </Form.List>
      </Card>
      {canManage && (
        <Button type="primary" htmlType="submit" loading={save.isPending}>Сохранить тексты</Button>
      )}
    </Form>
  );
}

export default function OnboardingPage() {
  const [tab, setTab] = useTabParam("people", ["people", "texts"]);
  const query = useQuery({ queryKey: ["onboarding-settings"], queryFn: getOnboardingSettings });

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Онбординг</h2>
      <Typography.Paragraph type="secondary">
        Что новичок проходит в приложении до первой отметки: приветствие, согласие на фото и
        геолокацию, обзор, эталонное селфи, инструктажи по ТБ и подпись. Шаг хранится на сервере —
        новый телефон продолжит с того же места.
      </Typography.Paragraph>
      {query.data && <LaunchCard settings={query.data} />}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "people", label: "Сотрудники", children: <PeopleTab /> },
          {
            key: "texts",
            label: "Тексты приложения",
            children: query.data ? <TextsTab settings={query.data} /> : null,
          },
        ]}
      />
    </div>
  );
}
