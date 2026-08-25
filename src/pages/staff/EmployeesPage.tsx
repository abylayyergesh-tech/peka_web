/** /employees — список сотрудников: поиск, фильтры и карточка человека.
 *
 * **Строка таблицы целиком нажимается** и открывает карточку, где собрано всё по
 * человеку: данные, заявления, личное дело, «Изменить» и «Уволить». Раньше те же
 * действия висели тремя ссылками в последней колонке — при девяти колонках их
 * приходилось искать горизонтальной прокруткой, а «Личное дело» ссылкой посреди
 * таблицы читалось как ещё одно поле, а не как действие.
 *
 * **Поиск и фильтры — отдельной карточкой сверху и крупным размером.** Список на
 * сотню человек начинается с поиска, и он не должен выглядеть как приписка к
 * заголовку. Поиск живой (с задержкой в треть секунды): набрать и ещё нажать
 * Enter — два действия там, где хватает одного.
 */
import {
  ClearOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { getRequest, listRequests, type RequestOut } from "@/api/requests";
import {
  createEmployee,
  listDepartments,
  listEmployees,
  terminateEmployee,
  updateEmployee,
  type EmployeeCreate,
  type EmployeeOut,
  type EmployeeUpdate,
  type Role,
} from "@/api/staff";
import { useCan } from "@/auth/store";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import {
  ApprovalSteps,
  ApprovalsList,
  RequestDetails,
  RequestStatusTags,
  RequestTypeTag,
  TimesheetCorrectionLines,
  describeRequest,
} from "@/pages/requests/shared";
import { EmployeeStatusTag, ROLE_OPTIONS } from "@/pages/staff/shared";

interface EmployeeFormValues {
  email?: string;
  role?: Role;
  full_name: string;
  position?: string;
  phone?: string;
  hire_date?: Dayjs;
  department_id?: number;
  personnel_no?: string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Работает" },
  { value: "terminated", label: "Уволен" },
];

export default function EmployeesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("staff.manage");
  // Заявления чужих людей отдаёт ручка под правом request.approve. Без него
  // раздел не показываем совсем — пустая рамка с 403 хуже, чем её отсутствие.
  const canSeeRequests = useCan("request.approve");
  const { limit, offset, tablePagination, reset } = usePagination();

  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  /** Что набрано в поиске и что уже ушло в запрос — разные вещи. */
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [editing, setEditing] = useState<EmployeeOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  /** Снимок открытой карточки. Свежие данные берём из списка по id, а снимок
   *  остаётся страховкой: после увольнения человек выпадает из фильтра
   *  «Работает», и карточка не должна опустеть у него под руками. */
  const [detailRow, setDetailRow] = useState<EmployeeOut | null>(null);
  /** Заявление, открытое поверх карточки сотрудника. */
  const [requestId, setRequestId] = useState<number | null>(null);
  const [terminationDate, setTerminationDate] = useState<Dayjs | null>(null);
  const [form] = Form.useForm<EmployeeFormValues>();

  // Живой поиск: запрос уходит, когда человек перестал печатать.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      reset();
    }, 300);
    return () => window.clearTimeout(timer);
    // `reset` пересоздаётся каждый рендер — в зависимостях ему не место.
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useQuery({
    queryKey: ["employees", { limit, offset, departmentId, statusFilter, q }],
    queryFn: () =>
      listEmployees({
        limit,
        offset,
        department_id: departmentId,
        status: statusFilter,
        q: q || undefined,
      }),
  });

  const deptQuery = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => listDepartments({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const deptOptions =
    deptQuery.data?.items.map((d) => ({ value: d.department_id, label: d.name })) ?? [];

  const save = useMutation({
    mutationFn: (body: EmployeeCreate | EmployeeUpdate) =>
      editing ? updateEmployee(editing.employee_id, body) : createEmployee(body as EmployeeCreate),
    onSuccess: (row) => {
      message.success(editing ? "Сохранено" : "Сотрудник создан");
      setModalOpen(false);
      // Карточка открыта — пусть показывает уже сохранённое.
      if (detailRow?.employee_id === row.employee_id) setDetailRow(row);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const terminate = useMutation({
    mutationFn: (vars: { id: number; date: string | null }) =>
      terminateEmployee(vars.id, { termination_date: vars.date }),
    onSuccess: (row) => {
      message.success("Сотрудник уволен");
      if (detailRow?.employee_id === row.employee_id) setDetailRow(row);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(row: EmployeeOut) {
    setEditing(row);
    form.setFieldsValue({
      full_name: row.full_name,
      position: row.position ?? undefined,
      phone: row.phone ?? undefined,
      hire_date: row.hire_date ? dayjs(row.hire_date) : undefined,
      department_id: row.department_id ?? undefined,
      personnel_no: row.personnel_no ?? undefined,
    });
    setModalOpen(true);
  }

  function onFinish(values: EmployeeFormValues) {
    const common: EmployeeUpdate = {
      full_name: values.full_name,
      position: values.position || null,
      phone: values.phone || null,
      hire_date: values.hire_date ? values.hire_date.format("YYYY-MM-DD") : null,
      department_id: values.department_id ?? null,
      personnel_no: values.personnel_no || null,
    };
    if (editing) {
      save.mutate(common);
    } else {
      save.mutate({
        ...common,
        // Пустое поле — это «логин не нужен», а не пустая строка.
        email: values.email?.trim() || null,
        role: values.role as Role,
      });
    }
  }

  const hasFilters = !!search || departmentId != null || statusFilter != null;

  function clearFilters() {
    setSearch("");
    setDepartmentId(undefined);
    setStatusFilter(undefined);
    reset();
  }

  const columns: ColumnsType<EmployeeOut> = [
    { title: "Таб. №", dataIndex: "personnel_no", width: 90, render: (v) => v || "—" },
    {
      title: "ФИО",
      dataIndex: "full_name",
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    { title: "Должность", dataIndex: "position", render: (v) => v || "—" },
    { title: "Отдел", dataIndex: "department_name", render: (v) => v || "—" },
    { title: "Email", dataIndex: "user_email", render: (v) => v || "—" },
    { title: "Телефон", dataIndex: "phone", render: (v) => v || "—" },
    { title: "Принят", dataIndex: "hire_date", render: (v) => fmtDate(v) },
    {
      title: "Статус",
      dataIndex: "status",
      width: 110,
      render: (v) => <EmployeeStatusTag status={v} />,
    },
  ];

  /** Данные открытой карточки: свежие из списка, иначе последний снимок. */
  const detail =
    query.data?.items.find((r) => r.employee_id === detailRow?.employee_id) ?? detailRow;

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <h2 style={{ margin: 0 }}>Сотрудники</h2>
        {canManage && (
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      {/* Поиск и фильтры — своей карточкой: с них начинается работа со списком. */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} lg={10}>
            <Input
              size="large"
              allowClear
              prefix={<SearchOutlined style={{ opacity: 0.45 }} />}
              placeholder="Поиск: ФИО, email, табельный номер"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Select
              size="large"
              allowClear
              style={{ width: "100%" }}
              placeholder="Все отделы"
              value={departmentId}
              onChange={(v) => {
                setDepartmentId(v);
                reset();
              }}
              options={deptOptions}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Select
              size="large"
              allowClear
              style={{ width: "100%" }}
              placeholder="Все статусы"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                reset();
              }}
              options={STATUS_OPTIONS}
            />
          </Col>
          <Col xs={24} lg={3}>
            <Button
              size="large"
              block
              icon={<ClearOutlined />}
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              Сбросить
            </Button>
          </Col>
        </Row>
        {hasFilters && (
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            Найдено: {query.data?.total ?? 0}
          </Typography.Text>
        )}
      </Card>

      <Table
        rowKey="employee_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        scroll={{ x: 900 }}
        // Строка — целиком кнопка: курсор и подсветка живут в index.css.
        rowClassName={() => "row-clickable"}
        onRow={(row) => ({ onClick: () => setDetailRow(row) })}
        locale={{
          emptyText: hasFilters ? "Под фильтры никто не подошёл" : "Сотрудников пока нет",
        }}
      />

      {/* Карточка человека: данные, действия, заявления и личное дело. */}
      <Drawer
        open={detail != null}
        onClose={() => setDetailRow(null)}
        width={640}
        destroyOnClose
        title={
          detail && (
            <Space direction="vertical" size={0}>
              <Space size={8}>
                <span>{detail.full_name}</span>
                <EmployeeStatusTag status={detail.status} />
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {[detail.position, detail.department_name].filter(Boolean).join(" · ") ||
                  "должность не указана"}
              </Typography.Text>
            </Space>
          )
        }
        extra={
          detail &&
          canManage && (
            <Space>
              <Button icon={<EditOutlined />} onClick={() => openEdit(detail)}>
                Изменить
              </Button>
              {detail.status === "active" && (
                <Popconfirm
                  title="Уволить сотрудника?"
                  description={
                    <div style={{ marginTop: 8 }}>
                      <DatePicker
                        value={terminationDate}
                        onChange={setTerminationDate}
                        format="DD.MM.YYYY"
                        placeholder="Дата увольнения"
                        style={{ width: 200 }}
                        getPopupContainer={(trigger) => trigger.parentElement as HTMLElement}
                      />
                    </div>
                  }
                  okText="Уволить"
                  cancelText="Отмена"
                  okButtonProps={{ danger: true, loading: terminate.isPending }}
                  onOpenChange={(open) => {
                    if (open) setTerminationDate(null);
                  }}
                  onConfirm={() =>
                    terminate.mutate({
                      id: detail.employee_id,
                      date: terminationDate ? terminationDate.format("YYYY-MM-DD") : null,
                    })
                  }
                >
                  <Button danger icon={<UserDeleteOutlined />}>
                    Уволить
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Табельный номер">
                {detail.personnel_no || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Должность">{detail.position || "—"}</Descriptions.Item>
              <Descriptions.Item label="Отдел">{detail.department_name || "—"}</Descriptions.Item>
              <Descriptions.Item label="Email">{detail.user_email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Телефон">{detail.phone || "—"}</Descriptions.Item>
              <Descriptions.Item label="Принят">{fmtDate(detail.hire_date)}</Descriptions.Item>
              {detail.status === "terminated" && (
                <Descriptions.Item label="Уволен">
                  {fmtDate(detail.termination_date)}
                </Descriptions.Item>
              )}
            </Descriptions>

            {canSeeRequests && (
              <>
                <Divider orientation="left" style={{ marginTop: 24 }}>
                  Заявления
                </Divider>
                <EmployeeRequests
                  employeeId={detail.employee_id}
                  onOpen={(id) => setRequestId(id)}
                />
              </>
            )}

            <Divider orientation="left" style={{ marginTop: 24 }}>
              Личное дело
            </Divider>
            {/* Файлы отдаёт бэкенд по праву staff.manage — по прямой ссылке их
                не открыть, поэтому и загрузка, и скачивание идут запросом. */}
            <AttachmentsPanel
              owner={{ kind: "personnel", employeeId: detail.employee_id }}
              canManage={canManage}
              emptyText="В деле пока нет документов"
              uploadHint="Договор, удостоверение, заявление — pdf, фото или документ Office"
            />
          </>
        )}
      </Drawer>

      {/* Заявление поверх карточки: маршрут согласования и история решений —
          то же, что на экране «Все заявления», но без уходов со страницы. */}
      <RequestDrawer requestId={requestId} onClose={() => setRequestId(null)} />

      <Modal
        title={editing ? "Изменить сотрудника" : "Новый сотрудник"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        // Поверх карточки сотрудника и заявления — у них свои слои.
        zIndex={1100}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {!editing && (
            <>
              {/* Адрес не обязателен: цеху вход в систему не нужен, и без него
                  сервер создаёт технический логин. Раньше поле было
                  обязательным, а сервер требовал УЖЕ существующего пользователя
                  — принять нового человека из этой формы было нельзя вовсе. */}
              <Form.Item
                name="email"
                label="Email"
                tooltip="Нужен только тем, кто заходит в систему. Оставьте пустым для цеха: карточка, табель и ведомость работают и без входа."
                extra="Новому адресу пароль не приходит — выдайте его в «Участниках»."
                rules={[{ type: "email", message: "Некорректный email" }]}
              >
                <Input placeholder="можно не заполнять" />
              </Form.Item>
              <Form.Item
                name="role"
                label="Роль"
                rules={[{ required: true, message: "Обязательное поле" }]}
              >
                <Select options={ROLE_OPTIONS} placeholder="Выберите роль" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="full_name"
            label="ФИО"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="position" label="Должность">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input />
          </Form.Item>
          <Form.Item name="hire_date" label="Дата приёма">
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="department_id" label="Отдел">
            <Select
              allowClear
              options={deptOptions}
              showSearch
              optionFilterProp="label"
              placeholder="Без отдела"
            />
          </Form.Item>
          <Form.Item name="personnel_no" label="Табельный номер">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/** Заявления сотрудника: тип, статус, о чём и когда подано. Строка нажимается —
 *  открывается само заявление. */
function EmployeeRequests({
  employeeId,
  onOpen,
}: {
  employeeId: number;
  onOpen: (requestId: number) => void;
}) {
  const query = useQuery({
    queryKey: ["employee-requests", employeeId],
    // Пятьдесят последних: заявлений у человека десятки за годы, и постраничная
    // навигация внутри карточки была бы навигацией внутри навигации.
    queryFn: () => listRequests({ employee_id: employeeId, limit: 50, offset: 0 }),
  });

  const columns: ColumnsType<RequestOut> = [
    {
      title: "Тип",
      dataIndex: "type",
      width: 150,
      render: (_, row) => <RequestTypeTag type={row.type} />,
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 190,
      render: (_, row) => <RequestStatusTags req={row} />,
    },
    {
      title: "О чём",
      render: (_, row) => (
        <Typography.Text style={{ fontSize: 14 }}>{describeRequest(row)}</Typography.Text>
      ),
    },
    {
      title: "Подано",
      dataIndex: "created_at",
      width: 130,
      render: (v) => (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {fmtDateTime(v)}
        </Typography.Text>
      ),
    },
  ];

  return (
    <Table<RequestOut>
      rowKey="request_id"
      size="small"
      loading={query.isPending}
      dataSource={query.data?.items}
      columns={columns}
      pagination={false}
      rowClassName={() => "row-clickable"}
      onRow={(row) => ({ onClick: () => onOpen(row.request_id) })}
      locale={{
        emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Заявлений не подавал" />
        ),
      }}
    />
  );
}

/** Само заявление: сводка, маршрут согласования и история решений.
 *
 *  Решать (одобрить/отклонить) отсюда нельзя намеренно: это работа экрана «Все
 *  заявления», где видно очередь и права на стадию. Здесь — посмотреть. */
function RequestDrawer({
  requestId,
  onClose,
}: {
  requestId: number | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["request", requestId],
    queryFn: () => getRequest(requestId!),
    enabled: requestId != null,
  });
  const req = query.data;

  return (
    <Drawer
      open={requestId != null}
      onClose={onClose}
      width={560}
      // Поверх карточки сотрудника, из которой открыли.
      zIndex={1050}
      destroyOnClose
      title={req ? `Заявление №${req.request_id}` : "Заявление"}
    >
      {query.isPending || !req ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <Spin />
        </div>
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <RequestDetails req={req} />
          {req.type === "timesheet_correction" && <TimesheetCorrectionLines req={req} />}
          <ApprovalSteps req={req} />
          <ApprovalsList req={req} />
        </Space>
      )}
    </Drawer>
  );
}
