/** Редактор черновика версии инструктажа и просмотр опубликованной.
 *
 * Версия — блоки; в блоке материалы (текст, картинка, видео, PDF) и тест.
 * Сохраняется целиком кнопкой «Сохранить черновик». Казахские поля можно
 * не заполнять — приложение покажет русские. */
import {
  App, Button, Card, Checkbox, Col, Empty, Form, Input, InputNumber, Row, Select, Space, Switch,
  Tag, Typography, Upload,
} from "antd";
import {
  ArrowDownOutlined, ArrowUpOutlined, CheckOutlined, DeleteOutlined, PaperClipOutlined,
  PlusOutlined, UploadOutlined,
} from "@ant-design/icons";
import type { FormListFieldData } from "antd";
import { useEffect, useState } from "react";

import { errorMessage } from "@/api/client";
import {
  BLOCK_TOPIC_LABELS,
  MATERIAL_KIND_LABELS,
  uploadBriefingFile,
  type BriefingBlock,
  type BriefingVersion,
  type MaterialKind,
} from "@/api/onboarding";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";

export interface DraftValues {
  pass_percent: number;
  repeat_days: number | null;
  blocks: BriefingBlock[];
}

const TOPIC_OPTIONS = Object.entries(BLOCK_TOPIC_LABELS).map(([value, label]) => ({ value, label }));
const KIND_OPTIONS = Object.entries(MATERIAL_KIND_LABELS).map(([value, label]) => ({ value, label }));

/** Только то, что принимает API: id и подписи файлов — служебные. */
export function toPayload(v: DraftValues): DraftValues {
  const s = (x: string | null | undefined) => (x ?? "").trim() || null;
  return {
    pass_percent: v.pass_percent,
    repeat_days: v.repeat_days || null,
    blocks: (v.blocks ?? []).map((b) => ({
      title_ru: b.title_ru.trim(),
      title_kk: s(b.title_kk),
      topic: b.topic,
      materials: (b.materials ?? []).map((m) => ({
        kind: m.kind,
        title_ru: s(m.title_ru),
        title_kk: s(m.title_kk),
        text_ru: s(m.text_ru),
        text_kk: s(m.text_kk),
        url: m.kind === "text" ? null : s(m.url),
        attachment_id: m.kind === "image" || m.kind === "pdf" ? m.attachment_id ?? null : null,
      })),
      questions: (b.questions ?? []).map((q) => ({
        text_ru: q.text_ru.trim(),
        text_kk: s(q.text_kk),
        multiple: !!q.multiple,
        options: (q.options ?? []).map((o) => ({
          text_ru: o.text_ru.trim(),
          text_kk: s(o.text_kk),
          is_correct: !!o.is_correct,
        })),
      })),
    })),
  };
}

function MoveButtons({ i, n, move, remove, name }: {
  i: number; n: number; name: number;
  move: (a: number, b: number) => void; remove: (name: number) => void;
}) {
  return (
    <Space size={4}>
      <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, i - 1)} />
      <Button size="small" icon={<ArrowDownOutlined />} disabled={i === n - 1} onClick={() => move(i, i + 1)} />
      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
    </Space>
  );
}

function RuKk({ base, name, label, area, required }: {
  base: (string | number)[]; name: string; label: string; area?: boolean; required?: boolean;
}) {
  const rules = required ? [{ required: true, whitespace: true, message: "Обязательное поле" }] : [];
  return (
    <Row gutter={12}>
      <Col xs={24} md={12}>
        <Form.Item name={[...base, `${name}_ru`]} label={`${label} (рус.)`} rules={rules}>
          {area ? <Input.TextArea rows={3} /> : <Input />}
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name={[...base, `${name}_kk`]} label={`${label} (каз.)`}>
          {area ? <Input.TextArea rows={3} placeholder="как на русском" /> : <Input placeholder="как на русском" />}
        </Form.Item>
      </Col>
    </Row>
  );
}

function MaterialFields({ versionId, blockField, field }: {
  versionId: number; blockField: FormListFieldData; field: FormListFieldData;
}) {
  const { message } = App.useApp();
  // Пути вложенных списков TypeScript не выводит — экземпляр формы без типа.
  const form = Form.useFormInstance();
  const path = ["blocks", blockField.name, "materials", field.name];
  const kind: MaterialKind = Form.useWatch([...path, "kind"], form);
  const fileName: string | null | undefined = Form.useWatch([...path, "file_name"], form);
  const fileUrl: string | null | undefined = Form.useWatch([...path, "file_url"], form);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const res = await uploadBriefingFile(versionId, file);
      form.setFieldValue([...path, "attachment_id"], res.attachment_id);
      form.setFieldValue([...path, "file_name"], res.file_name);
      form.setFieldValue([...path, "file_url"], res.url);
      form.setFieldValue([...path, "url"], null);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Row gutter={12}>
        <Col xs={24} md={6}>
          <Form.Item name={[field.name, "kind"]} label="Вид">
            <Select options={KIND_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={9}>
          <Form.Item name={[field.name, "title_ru"]} label="Подпись (рус.)"><Input /></Form.Item>
        </Col>
        <Col xs={24} md={9}>
          <Form.Item name={[field.name, "title_kk"]} label="Подпись (каз.)"><Input placeholder="как на русском" /></Form.Item>
        </Col>
      </Row>
      <Form.Item name={[field.name, "attachment_id"]} hidden><Input /></Form.Item>
      <Form.Item name={[field.name, "file_name"]} hidden><Input /></Form.Item>
      <Form.Item name={[field.name, "file_url"]} hidden><Input /></Form.Item>
      {kind === "text" && <RuKk base={[field.name]} name="text" label="Текст" area required />}
      {(kind === "image" || kind === "pdf") && (
        <Space direction="vertical" style={{ width: "100%", marginBottom: 12 }}>
          <Space wrap>
            <Upload
              accept={kind === "pdf" ? "application/pdf" : "image/jpeg,image/png,image/webp"}
              showUploadList={false}
              beforeUpload={(f) => { void upload(f); return false; }}
            >
              <Button icon={<UploadOutlined />} loading={uploading}>
                {fileName ? "Заменить файл" : "Загрузить файл"}
              </Button>
            </Upload>
            {fileName && (
              <span>
                <PaperClipOutlined />{" "}
                {fileUrl ? <a href={fileUrl} target="_blank" rel="noreferrer">{fileName}</a> : fileName}
              </span>
            )}
          </Space>
          {!fileName && (
            <Form.Item name={[field.name, "url"]} label="…или ссылка на файл" style={{ marginBottom: 0 }}>
              <Input placeholder="https://…" />
            </Form.Item>
          )}
        </Space>
      )}
      {kind === "video" && (
        <Form.Item name={[field.name, "url"]} label="Ссылка на видео"
          rules={[{ required: true, message: "Нужна ссылка" }]}>
          <Input placeholder="https://youtu.be/…" />
        </Form.Item>
      )}
    </>
  );
}

function QuestionFields({ blockField, field }: { blockField: FormListFieldData; field: FormListFieldData }) {
  // Пути вложенных списков TypeScript не выводит — экземпляр формы без типа.
  const form = Form.useFormInstance();
  const multiple: boolean = Form.useWatch(
    ["blocks", blockField.name, "questions", field.name, "multiple"], form);
  return (
    <>
      <RuKk base={[field.name]} name="text" label="Вопрос" required />
      <Form.Item name={[field.name, "multiple"]} valuePropName="checked" style={{ marginBottom: 8 }}>
        <Switch checkedChildren="несколько верных" unCheckedChildren="один верный" />
      </Form.Item>
      <Form.List name={[field.name, "options"]}>
        {(opts, { add, remove }) => (
          <Space direction="vertical" style={{ width: "100%" }}>
            {opts.map((o) => (
              <Row gutter={8} key={o.key} align="middle">
                <Col flex="none">
                  <Form.Item name={[o.name, "is_correct"]} valuePropName="checked" noStyle>
                    <Checkbox
                      onChange={(e) => {
                        if (!multiple && e.target.checked) {
                          // Один верный: отметили этот — с остальных снять.
                          const path = ["blocks", blockField.name, "questions", field.name, "options"];
                          const list = (form.getFieldValue(path) ?? []) as { is_correct: boolean }[];
                          form.setFieldValue(path, list.map((x, idx) => ({ ...x, is_correct: idx === o.name })));
                        }
                      }}
                    >
                      верный
                    </Checkbox>
                  </Form.Item>
                </Col>
                <Col flex="auto">
                  <Form.Item name={[o.name, "text_ru"]} noStyle
                    rules={[{ required: true, whitespace: true, message: "Текст варианта" }]}>
                    <Input placeholder="Вариант (рус.)" />
                  </Form.Item>
                </Col>
                <Col flex="auto">
                  <Form.Item name={[o.name, "text_kk"]} noStyle>
                    <Input placeholder="Вариант (каз.)" />
                  </Form.Item>
                </Col>
                <Col flex="none">
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(o.name)} />
                </Col>
              </Row>
            ))}
            <Button size="small" icon={<PlusOutlined />}
              onClick={() => add({ text_ru: "", text_kk: null, is_correct: false })}>
              Добавить вариант
            </Button>
          </Space>
        )}
      </Form.List>
    </>
  );
}

export function DraftEditor({ version, saving, onSave, onDirty }: {
  version: BriefingVersion;
  saving: boolean;
  onSave: (v: DraftValues) => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const [form] = Form.useForm<DraftValues>();
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty, "Несохранённые правки черновика потеряются.");

  useEffect(() => {
    form.setFieldsValue({
      pass_percent: version.pass_percent,
      repeat_days: version.repeat_days,
      blocks: version.blocks,
    });
    setDirty(false);
    onDirty?.(false);
  }, [version, form]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={() => { if (!dirty) { setDirty(true); onDirty?.(true); } }}
      onFinish={(v) => onSave(toPayload(v))}
    >
      <Row gutter={12}>
        <Col xs={24} md={8}>
          <Form.Item name="pass_percent" label="Проходной балл" extra="Блок сдан, если верно ответил на столько вопросов"
            rules={[{ required: true }]}>
            <InputNumber min={1} max={100} addonAfter="%" style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="repeat_days" label="Повторять через" extra="Пусто — не повторять">
            <InputNumber min={1} max={3650} addonAfter="дн." style={{ width: "100%" }} />
          </Form.Item>
        </Col>
      </Row>

      <Form.List name="blocks">
        {(blocks, { add, remove, move }) => (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {blocks.map((b, bi) => (
              <Card key={b.key} size="small" title={`Блок ${bi + 1}`}
                extra={<MoveButtons i={bi} n={blocks.length} name={b.name} move={move} remove={remove} />}>
                <Row gutter={12}>
                  <Col xs={24} md={16}>
                    <RuKk base={[b.name]} name="title" label="Название блока" required />
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name={[b.name, "topic"]} label="Тема">
                      <Select options={TOPIC_OPTIONS} />
                    </Form.Item>
                  </Col>
                </Row>

                <Typography.Title level={5}>Материалы</Typography.Title>
                <Form.List name={[b.name, "materials"]}>
                  {(mats, mOps) => (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {mats.map((m, mi) => (
                        <Card key={m.key} size="small" type="inner" title={`Материал ${mi + 1}`}
                          extra={<MoveButtons i={mi} n={mats.length} name={m.name} move={mOps.move} remove={mOps.remove} />}>
                          <MaterialFields versionId={version.version_id} blockField={b} field={m} />
                        </Card>
                      ))}
                      <Button size="small" icon={<PlusOutlined />}
                        onClick={() => mOps.add({ kind: "text", title_ru: null, text_ru: "", url: null, attachment_id: null })}>
                        Добавить материал
                      </Button>
                    </Space>
                  )}
                </Form.List>

                <Typography.Title level={5} style={{ marginTop: 16 }}>Тест</Typography.Title>
                <Form.List name={[b.name, "questions"]}>
                  {(qs, qOps) => (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {qs.map((q, qi) => (
                        <Card key={q.key} size="small" type="inner" title={`Вопрос ${qi + 1}`}
                          extra={<MoveButtons i={qi} n={qs.length} name={q.name} move={qOps.move} remove={qOps.remove} />}>
                          <QuestionFields blockField={b} field={q} />
                        </Card>
                      ))}
                      <Button size="small" icon={<PlusOutlined />}
                        onClick={() => qOps.add({
                          text_ru: "", text_kk: null, multiple: false,
                          options: [{ text_ru: "", is_correct: true }, { text_ru: "", is_correct: false }],
                        })}>
                        Добавить вопрос
                      </Button>
                      {qs.length === 0 && (
                        <Typography.Text type="secondary">Без вопросов блок засчитывается сразу после чтения.</Typography.Text>
                      )}
                    </Space>
                  )}
                </Form.List>
              </Card>
            ))}
            <Button icon={<PlusOutlined />}
              onClick={() => add({ title_ru: "", title_kk: null, topic: "labor", materials: [], questions: [] })}>
              Добавить блок
            </Button>
          </Space>
        )}
      </Form.List>

      <div style={{ position: "sticky", bottom: 0, background: "#fff", padding: "12px 0", marginTop: 16, zIndex: 2 }}>
        <Button type="primary" htmlType="submit" loading={saving}>Сохранить черновик</Button>
        {dirty && <Typography.Text type="warning" style={{ marginLeft: 12 }}>Есть несохранённые правки</Typography.Text>}
      </div>
    </Form>
  );
}

export function VersionView({ version }: { version: BriefingVersion }) {
  if (!version.blocks.length) return <Empty description="В версии нет блоков" />;
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Typography.Text type="secondary">
        Проходной балл {version.pass_percent}% ·{" "}
        {version.repeat_days ? `повтор через ${version.repeat_days} дн.` : "без повтора"}
      </Typography.Text>
      {version.blocks.map((b, i) => (
        <Card key={b.block_id ?? i} size="small"
          title={<>Блок {i + 1}. {b.title_ru} <Tag>{BLOCK_TOPIC_LABELS[b.topic]}</Tag></>}>
          {b.materials.map((m, mi) => (
            <div key={m.material_id ?? mi} style={{ marginBottom: 8 }}>
              <Tag>{MATERIAL_KIND_LABELS[m.kind]}</Tag>
              {m.title_ru && <b>{m.title_ru} </b>}
              {m.kind === "text" && <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{m.text_ru}</Typography.Paragraph>}
              {m.kind !== "text" && (m.file_url || m.url) && (
                <a href={m.file_url ?? m.url ?? undefined} target="_blank" rel="noreferrer">
                  {m.file_name ?? m.url}
                </a>
              )}
            </div>
          ))}
          {b.questions.length > 0 && (
            <ol style={{ paddingLeft: 20, marginBottom: 0 }}>
              {b.questions.map((q, qi) => (
                <li key={q.question_id ?? qi}>
                  {q.text_ru} {q.multiple && <Tag>несколько верных</Tag>}
                  <ul style={{ paddingLeft: 18 }}>
                    {q.options.map((o, oi) => (
                      <li key={o.option_id ?? oi}>
                        {o.text_ru} {o.is_correct && <CheckOutlined style={{ color: "#389e0d" }} />}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ))}
    </Space>
  );
}
