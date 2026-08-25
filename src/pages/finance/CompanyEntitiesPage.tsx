/** /company-entities — наши юр. лица: реквизиты компаний, от чьего имени торгуем.
 *
 *  Здесь заводят и правят БИН, банк, БИК, КБе и расчётный счёт. Это не
 *  косметика: БИН различает компании (названия в жизни похожи), по счёту
 *  банковская выписка находит своего владельца, а БИК с КБе печатаются в
 *  платёжном поручении — ошибка уводит деньги не туда. Поэтому право на правку
 *  отдельное, `finance.manage`.
 *
 *  Это НЕ «Юр. лица» из зарплатного раздела: там оформление сотрудника
 *  (официально / неофициально / ИП), и БИНа у таких строк нет по определению. */
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createCompanyEntity,
  deactivateCompanyEntity,
  updateCompanyEntity,
  type CompanyEntityOut,
} from "@/api/companies";
import { useCan } from "@/auth/store";
import {
  COMPANY_ENTITIES_KEY,
  useCompanyEntities,
} from "@/pages/finance/companyEntities";

interface EntityForm {
  name: string;
  tax_id: string;
  address?: string;
  bank_name?: string;
  bank_bic?: string;
  kbe?: string;
  bank_account?: string;
  is_default?: boolean;
}

export default function CompanyEntitiesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("finance.manage");
  const [showClosed, setShowClosed] = useState(false);
  const entities = useCompanyEntities(showClosed);
  const [editing, setEditing] = useState<CompanyEntityOut | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<EntityForm>();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: COMPANY_ENTITIES_KEY });
    queryClient.invalidateQueries({ queryKey: ["company-money"] });
  }

  const save = useMutation({
    mutationFn: (values: EntityForm) => {
      const body = {
        name: values.name.trim(),
        tax_id: values.tax_id,
        address: values.address?.trim() || null,
        bank_name: values.bank_name?.trim() || null,
        bank_bic: values.bank_bic?.trim() || null,
        kbe: values.kbe?.trim() || null,
        bank_account: values.bank_account?.trim() || null,
        is_default: values.is_default ?? false,
      };
      return editing
        ? updateCompanyEntity(editing.company_entity_id, body)
        : createCompanyEntity(body);
    },
    onSuccess: (entity) => {
      message.success(editing ? `«${entity.name}» сохранено` : "Компания заведена");
      setModalOpen(false);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const close = useMutation({
    mutationFn: (row: CompanyEntityOut) =>
      deactivateCompanyEntity(row.company_entity_id),
    onSuccess: (entity) => {
      message.success(`«${entity.name}» закрыта`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const makeDefault = useMutation({
    mutationFn: (row: CompanyEntityOut) =>
      updateCompanyEntity(row.company_entity_id, { is_default: true }),
    onSuccess: (entity) => {
      message.success(`По умолчанию теперь «${entity.name}»`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  /** Значения формы задаются `initialValues`: окно с `destroyOnHidden` создаёт
   *  форму заново на каждое открытие, и до него формы ещё нет. */
  const initialValues: EntityForm = editing
    ? {
        name: editing.name,
        tax_id: editing.tax_id,
        address: editing.address ?? undefined,
        bank_name: editing.bank_name ?? undefined,
        bank_bic: editing.bank_bic ?? undefined,
        kbe: editing.kbe ?? undefined,
        bank_account: editing.bank_account ?? undefined,
        is_default: editing.is_default,
      }
    : { name: "", tax_id: "", is_default: false };

  const columns: ColumnsType<CompanyEntityOut> = [
    {
      title: "Компания",
      dataIndex: "name",
      render: (v: string, row) => (
        <Space size={6}>
          <span style={{ fontWeight: 500 }}>{v}</span>
          {row.is_default && (
            <Tooltip title="Подставляется новым накладным и платежам">
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                по умолчанию
              </Tag>
            </Tooltip>
          )}
          {!row.is_active && <Tag style={{ marginInlineEnd: 0 }}>закрыта</Tag>}
        </Space>
      ),
    },
    {
      title: "БИН / ИИН",
      dataIndex: "tax_id",
      width: 150,
      render: (v: string) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
      ),
    },
    { title: "Банк", dataIndex: "bank_name", width: 170, render: (v) => v || "—" },
    { title: "БИК", dataIndex: "bank_bic", width: 110, render: (v) => v || "—" },
    {
      title: "КБе",
      dataIndex: "kbe",
      width: 70,
      align: "center",
      render: (v) => v || "—",
    },
    {
      title: "Счёт",
      dataIndex: "bank_account",
      width: 220,
      render: (v: string | null) =>
        v ? (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
        ) : (
          "—"
        ),
    },
    { title: "Адрес", dataIndex: "address", render: (v) => v || "—" },
    {
      title: "",
      width: 220,
      render: (_, row) =>
        canManage && (
          <Space size="middle">
            <a
              onClick={() => {
                setEditing(row);
                setModalOpen(true);
              }}
            >
              Изменить
            </a>
            {row.is_active && !row.is_default && (
              <a onClick={() => makeDefault.mutate(row)}>По умолчанию</a>
            )}
            {row.is_active && (
              <Popconfirm
                title="Закрыть компанию?"
                description="Накладные и журналы за ней остаются; новым документам её больше не подставят."
                okText="Закрыть"
                cancelText="Отмена"
                onConfirm={() => close.mutate(row)}
              >
                <a>Закрыть</a>
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>Наши юр. лица</h2>
        <Space>
          <Space size={6}>
            <Switch checked={showClosed} onChange={setShowClosed} size="small" />
            <span>Показывать закрытые</span>
          </Space>
          {canManage && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              Добавить
            </Button>
          )}
        </Space>
      </Space>

      {!canManage && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Только просмотр"
          description="Менять реквизиты может финансовая роль — нужно право finance.manage. БИН и счёт печатаются в платёжном поручении."
        />
      )}

      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Это компании, от чьего имени идёт торговля: по ним раздельно считаются
        кредиторка, дебиторка, накладные и банковские выписки. Не путать с «Юр.
        лицами» в зарплатном разделе — там оформление сотрудника.{" "}
        <Link to="/reports/company-entities">Деньги по юр. лицам →</Link>
      </Typography.Paragraph>

      {entities.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={errorMessage(entities.error)}
        />
      )}

      <Table<CompanyEntityOut>
        rowKey="company_entity_id"
        size="small"
        loading={entities.isPending}
        dataSource={entities.data}
        columns={columns}
        pagination={false}
        scroll={{ x: 1300 }}
        locale={{ emptyText: "Компаний пока нет" }}
      />

      <Modal
        title={editing ? `Реквизиты «${editing.name}»` : "Новая компания"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnHidden
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={(v) => save.mutate(v)}
        >
          <Form.Item
            name="name"
            label="Компания"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={256} placeholder="ИП КАБЫЛДИНОВ" />
          </Form.Item>
          <Form.Item
            name="tax_id"
            label="БИН / ИИН"
            tooltip="12 цифр. Именно БИН различает компании: названия бывают похожими"
            rules={[
              { required: true, message: "Обязательное поле" },
              {
                validator: (_r, value) =>
                  !value || String(value).replace(/\D/g, "").length === 12
                    ? Promise.resolve()
                    : Promise.reject(new Error("БИН/ИИН — это 12 цифр")),
              },
            ]}
          >
            <Input maxLength={32} placeholder="990614350594" />
          </Form.Item>
          <Form.Item name="address" label="Адрес">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="bank_name" label="Банк">
                <Input maxLength={256} placeholder="АО Kaspi Bank" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item name="bank_bic" label="БИК">
                <Input maxLength={16} placeholder="CASPKZKA" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="kbe" label="КБе">
                <Input maxLength={4} placeholder="19" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="bank_account"
            label="Расчётный счёт (IBAN)"
            tooltip="По нему банковская выписка находит свою компанию"
          >
            <Input maxLength={34} placeholder="KZ67722S000054666866" />
          </Form.Item>
          <Form.Item
            name="is_default"
            label="По умолчанию"
            valuePropName="checked"
            extra="Подставляется новым накладным и платежам. Такая компания одна."
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
