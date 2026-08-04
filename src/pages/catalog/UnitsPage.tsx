import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import { createUnit, listUnits, type Dimension, type UnitOut } from "@/api/catalog";
import { useCan } from "@/auth/store";
import { fmtDate, fmtQty } from "@/components/format";
import { usePagination } from "@/components/usePagination";
import { DIMENSION_LABELS, DIMENSION_OPTIONS } from "@/pages/catalog/labels";
import { useUnitOptions } from "@/pages/catalog/useCatalogOptions";

interface UnitFormValues {
  name: string;
  dimension: Dimension;
  base_unit_id?: number | null;
  factor_to_base: string;
}

export default function UnitsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("catalog.manage");
  const { limit, offset, tablePagination } = usePagination();
  const units = useUnitOptions();

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<UnitFormValues>();
  // A base unit (base_unit_id=null) must keep factor_to_base=1; the input is
  // only meaningful for derived units.
  const baseUnitId = Form.useWatch("base_unit_id", form);

  const query = useQuery({
    queryKey: ["units", { limit, offset }],
    queryFn: () => listUnits({ limit, offset }),
  });

  const save = useMutation({
    mutationFn: (values: UnitFormValues) =>
      createUnit({
        name: values.name,
        dimension: values.dimension,
        base_unit_id: values.base_unit_id ?? null,
        factor_to_base:
          values.base_unit_id == null ? "1" : values.factor_to_base,
      }),
    onSuccess: () => {
      message.success("Создано");
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  function openCreate() {
    form.resetFields();
    form.setFieldsValue({ factor_to_base: "1" });
    setModalOpen(true);
  }

  const columns: ColumnsType<UnitOut> = [
    { title: "Название", dataIndex: "name" },
    {
      title: "Размерность",
      dataIndex: "dimension",
      width: 140,
      render: (d: Dimension) => <Tag>{DIMENSION_LABELS[d]}</Tag>,
    },
    {
      title: "Базовая ед.",
      dataIndex: "base_unit_id",
      width: 160,
      render: (id: number | null) => units.nameOf(id),
    },
    {
      title: "Коэффициент",
      dataIndex: "factor_to_base",
      width: 140,
      render: (v: string) => fmtQty(v),
    },
    {
      title: "Создана",
      dataIndex: "created_at",
      width: 120,
      render: (v: string) => fmtDate(v),
    },
  ];

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}
      >
        <h2 style={{ margin: 0 }}>Единицы измерения</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить
          </Button>
        )}
      </Space>

      <Table<UnitOut>
        rowKey="unit_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
      />

      <Modal
        title="Новая единица"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ factor_to_base: "1" }}
          onFinish={(v) => save.mutate(v)}
        >
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: "Обязательное поле" }]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item
            name="dimension"
            label="Размерность"
            rules={[{ required: true, message: "Выберите размерность" }]}
          >
            <Select options={DIMENSION_OPTIONS} placeholder="Размерность" />
          </Form.Item>
          <Form.Item
            name="base_unit_id"
            label="Базовая единица"
            extra="Оставьте пустым, если единица сама является базовой."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              loading={units.isLoading}
              options={units.options}
              placeholder="Нет (базовая)"
            />
          </Form.Item>
          <Form.Item
            name="factor_to_base"
            label="Коэффициент к базовой единице"
            rules={[
              {
                validator: (_, value: string) => {
                  if (baseUnitId == null) return Promise.resolve();
                  if (value != null && Number(value) > 0) return Promise.resolve();
                  return Promise.reject(new Error("Должен быть больше 0"));
                },
              },
            ]}
          >
            <InputNumber
              stringMode
              min="0"
              style={{ width: "100%" }}
              disabled={baseUnitId == null}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
