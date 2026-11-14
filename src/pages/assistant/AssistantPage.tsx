/** «Абеке (Beta)» — ИИ-ассистент кабинета: чат с моделью Gemini, которая
 * отвечает по базе знаний (RAG): весь код бэкенда, настройки репозиториев,
 * документация, инструкции кабинета, снимок настроек организации и файлы,
 * которые сюда загрузили. Ответ приходит потоком, со ссылками на источники. */
import {
  DeleteOutlined, FileTextOutlined, MessageOutlined, PaperClipOutlined, PlusOutlined,
  RobotOutlined, SendOutlined, StopOutlined, UploadOutlined, UserOutlined,
} from "@ant-design/icons";
import {
  Alert, App, Badge, Button, Collapse, Drawer, Empty, Input, List, Popconfirm, Space, Spin,
  Table, Tag, Tooltip, Typography, Upload,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/client";
import {
  createChat, deleteChat, deleteKbDocument, getAssistantStatus, listChats, listKbDocuments,
  listMessages, sendMessageStream, uploadKbDocument,
  type AssistantMessage, type AssistantSource, type KbDocument,
} from "@/api/assistant";
import { fmtDateTime } from "@/components/format";

const SUGGESTIONS = [
  "Как устроено списание при продаже блюда по тех-карте?",
  "Как исправить или сторнировать закрытый чек?",
  "Какие права нужны сборщику и старшему сборщику?",
  "Где посмотреть кредиторку по нашим юр. лицам?",
  "Какие у нас сейчас правила учёта: опоздание, переработка, неявка?",
  "Какие эндпоинты есть у инвентаризации?",
];

interface LiveMessage {
  role: "user" | "assistant";
  content: string;
  sources: AssistantSource[];
  error?: string | null;
  model?: string | null;
  pending?: boolean;
}

function Sources({ sources }: { sources: AssistantSource[] }) {
  if (!sources.length) return null;
  return (
    <Collapse
      size="small"
      ghost
      style={{ marginTop: 6 }}
      items={[{
        key: "s",
        label: <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Источники в базе знаний: {sources.length}
        </Typography.Text>,
        children: (
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            {sources.map((s) => (
              <div key={`${s.n}-${s.document_id}`} style={{ fontSize: 12 }}>
                <Tag>{s.n}</Tag>
                <b>{s.title}</b>
                {s.heading && s.heading !== s.title && (
                  <Typography.Text type="secondary"> — {s.heading}</Typography.Text>
                )}
                {s.source !== "system" && <Tag color="blue" style={{ marginLeft: 6 }}>
                  {s.source === "upload" ? "загружен" : "настройки"}</Tag>}
                <div style={{ color: "#666", marginTop: 2 }}>{s.snippet}…</div>
              </div>
            ))}
          </Space>
        ),
      }]}
    />
  );
}

function Bubble({ m }: { m: LiveMessage }) {
  const mine = m.role === "user";
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: mine ? "flex-end" : "flex-start",
      marginBottom: 16 }}>
      {!mine && (
        <div style={{ width: 32, height: 32, borderRadius: 16, background: "#0d4d3c", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <RobotOutlined />
        </div>
      )}
      <div style={{
        maxWidth: "78%", padding: "10px 14px", borderRadius: 12,
        background: mine ? "#0d4d3c" : "#fff", color: mine ? "#fff" : "inherit",
        border: mine ? "none" : "1px solid rgba(0,0,0,0.08)", overflowX: "auto",
      }}>
        {mine ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
        ) : (
          <div className="abeke-md">
            {m.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            ) : (
              m.pending && <Spin size="small" />
            )}
            {m.pending && m.content && <span className="abeke-caret">▍</span>}
            {m.error && <Alert type="error" showIcon style={{ marginTop: 8 }} message={m.error} />}
            <Sources sources={m.sources} />
          </div>
        )}
      </div>
      {mine && (
        <div style={{ width: 32, height: 32, borderRadius: 16, background: "#e7efe9",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <UserOutlined />
        </div>
      )}
    </div>
  );
}

function KnowledgeBase({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const docs = useQuery({ queryKey: ["kb-documents"], queryFn: listKbDocuments, enabled: open });
  const [filter, setFilter] = useState("");
  const remove = useMutation({
    mutationFn: deleteKbDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-status"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const rows = useMemo(() => (docs.data ?? []).filter((d) =>
    !filter || d.title.toLowerCase().includes(filter.toLowerCase())
    || (d.category ?? "").toLowerCase().includes(filter.toLowerCase())), [docs.data, filter]);
  return (
    <Drawer open={open} onClose={onClose} width={760} title="База знаний Абеке">
      <Typography.Paragraph type="secondary">
        Системная часть собрана из всех репозиториев (код бэкенда, кабинет, касса, сайты,
        документация, справочники API, прав, настроек) — она общая и только для чтения.
        Документы организации — загруженные файлы и снимок текущих настроек.
      </Typography.Paragraph>
      <Input.Search allowClear placeholder="Поиск по названию или разделу" value={filter}
        onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 12 }} />
      <Table<KbDocument>
        size="small"
        rowKey="kb_document_id"
        loading={docs.isPending}
        dataSource={rows}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        columns={[
          { title: "Документ", dataIndex: "title", render: (t: string, d) => (
            <Space size={4} wrap>
              <FileTextOutlined />
              <span>{t}</span>
              {d.is_system ? <Tag>система</Tag> : <Tag color="blue">
                {d.source === "upload" ? "загружен" : "настройки"}</Tag>}
            </Space>
          ) },
          { title: "Раздел", dataIndex: "category", width: 200, render: (c: string | null) => c ?? "—" },
          { title: "Фрагм.", dataIndex: "chunk_count", width: 70, align: "right" },
          { title: "Векторы", dataIndex: "embedded", width: 80,
            render: (v: boolean) => (v ? <Tag color="green">есть</Tag> : <Tag>нет</Tag>) },
          { title: "", width: 50, render: (_v, d) => d.source === "upload" && (
            <Popconfirm title="Удалить документ из базы знаний?" okText="Удалить" cancelText="Отмена"
              onConfirm={() => remove.mutate(d.kb_document_id)}>
              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          ) },
        ]}
      />
    </Drawer>
  );
}

export default function AssistantPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["assistant-status"], queryFn: getAssistantStatus });
  const chats = useQuery({ queryKey: ["assistant-chats"], queryFn: listChats });
  const [chatId, setChatId] = useState<number | null>(null);
  const [live, setLive] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const history = useQuery({
    queryKey: ["assistant-messages", chatId],
    queryFn: () => listMessages(chatId!),
    enabled: chatId != null,
  });

  useEffect(() => {
    if (chatId == null && chats.data?.length) setChatId(chats.data[0].assistant_chat_id);
  }, [chats.data, chatId]);

  useEffect(() => {
    if (history.data && !busy) {
      setLive(history.data.map((m: AssistantMessage) => ({
        role: m.role, content: m.content, sources: m.sources ?? [], error: m.error, model: m.model,
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [live]);

  const upload = useMutation({
    mutationFn: uploadKbDocument,
    onSuccess: (d) => {
      message.success(`«${d.title}» в базе знаний: ${d.chunk_count} фрагм.`);
      queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-status"] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const removeChat = useMutation({
    mutationFn: deleteChat,
    onSuccess: (_v, id) => {
      if (id === chatId) {
        setChatId(null);
        setLive([]);
      }
      queryClient.invalidateQueries({ queryKey: ["assistant-chats"] });
    },
  });

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    let id = chatId;
    try {
      if (id == null) {
        const chat = await createChat();
        id = chat.assistant_chat_id;
        setChatId(id);
      }
    } catch (e) {
      message.error(errorMessage(e));
      return;
    }
    setInput("");
    setBusy(true);
    setLive((prev) => [...prev, { role: "user", content: q, sources: [] },
      { role: "assistant", content: "", sources: [], pending: true }]);
    const patchLast = (fn: (m: LiveMessage) => LiveMessage) =>
      setLive((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await sendMessageStream(id!, q, {
        onSources: (sources) => patchLast((m) => ({ ...m, sources })),
        onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
        onError: (err) => patchLast((m) => ({ ...m, error: err })),
      }, ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) patchLast((m) => ({ ...m, error: errorMessage(e) }));
    } finally {
      patchLast((m) => ({ ...m, pending: false }));
      setBusy(false);
      abortRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["assistant-chats"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-messages", id] });
    }
  }

  const s = status.data;
  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 140px)", minHeight: 520 }}>
      <style>{`
        .abeke-md p { margin: 0 0 8px; }
        .abeke-md p:last-child { margin-bottom: 0; }
        .abeke-md pre { background: #f6f7f5; padding: 10px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
        .abeke-md code { background: #f1f2ef; padding: 1px 4px; border-radius: 4px; font-size: 12px; }
        .abeke-md pre code { background: none; padding: 0; }
        .abeke-md table { border-collapse: collapse; margin: 8px 0; font-size: 13px; }
        .abeke-md th, .abeke-md td { border: 1px solid #e3e3e0; padding: 4px 8px; }
        .abeke-md ul, .abeke-md ol { padding-left: 20px; margin: 4px 0 8px; }
        .abeke-caret { animation: abekeBlink 1s steps(1) infinite; }
        @keyframes abekeBlink { 50% { opacity: 0; } }
        @media (max-width: 900px) { .abeke-side { display: none; } }
      `}</style>
      <div className="abeke-side" style={{ width: 260, flexShrink: 0, display: "flex",
        flexDirection: "column", gap: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setChatId(null); setLive([]); }}>
          Новый чат
        </Button>
        <div style={{ overflowY: "auto", flex: 1 }}>
          <List
            size="small"
            loading={chats.isPending}
            dataSource={chats.data ?? []}
            locale={{ emptyText: "Чатов пока нет" }}
            renderItem={(c) => (
              <List.Item
                onClick={() => !busy && setChatId(c.assistant_chat_id)}
                style={{ cursor: "pointer", borderRadius: 8, padding: "6px 8px",
                  background: c.assistant_chat_id === chatId ? "#e7efe9" : undefined }}
                actions={[
                  <Popconfirm key="d" title="Удалить чат?" okText="Удалить" cancelText="Отмена"
                    onConfirm={(e) => { e?.stopPropagation(); removeChat.mutate(c.assistant_chat_id); }}>
                    <Button type="text" size="small" icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ]}
              >
                <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
                  <Typography.Text ellipsis style={{ maxWidth: 170 }}>
                    <MessageOutlined style={{ marginRight: 6 }} />{c.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {fmtDateTime(c.updated_at)}
                  </Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Space style={{ justifyContent: "space-between", width: "100%", marginBottom: 8 }} wrap>
          <Space align="center">
            <h2 style={{ margin: 0 }}>Абеке</h2>
            <Tag color="purple">Beta</Tag>
            {s && (
              <Tooltip title={`Модель ответа: ${s.model}; поиск: ${s.embed_model}`}>
                <Badge status={s.configured ? "success" : "warning"}
                  text={s.configured ? s.model : "модель не подключена"} />
              </Tooltip>
            )}
          </Space>
          <Space wrap>
            <Upload
              showUploadList={false}
              accept={(s?.supported_formats ?? []).join(",")}
              beforeUpload={(file) => { upload.mutate(file); return false; }}
            >
              <Button icon={<UploadOutlined />} loading={upload.isPending}>Загрузить файл</Button>
            </Upload>
            <Button icon={<PaperClipOutlined />} onClick={() => setKbOpen(true)}>
              База знаний{s ? ` · ${s.system_documents + s.organization_documents}` : ""}
            </Button>
          </Space>
        </Space>
        {s && !s.configured && (
          <Alert type="warning" showIcon style={{ marginBottom: 8 }}
            message="Ключ Gemini не настроен: Абеке покажет найденное в базе знаний, но без ответа модели." />
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 4px", background: "#fafaf7",
          borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)" }}>
          {live.length === 0 ? (
            <div style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
              <RobotOutlined style={{ fontSize: 40, color: "#0d4d3c" }} />
              <Typography.Title level={4} style={{ marginTop: 8 }}>Привет! Я Абеке.</Typography.Title>
              <Typography.Paragraph type="secondary">
                Знаю весь бэкенд и кабинет Pekarelli RSM, настройки репозиториев и вашей
                организации. Спросите, как что устроено или как сделать что-то в кабинете,
                или загрузите файл — буду отвечать и по нему.
              </Typography.Paragraph>
              <Space wrap style={{ justifyContent: "center" }}>
                {SUGGESTIONS.map((q) => (
                  <Button key={q} size="small" onClick={() => ask(q)}>{q}</Button>
                ))}
              </Space>
            </div>
          ) : (
            <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 12px" }}>
              {history.isFetching && !busy && live.length === 0 && <Spin />}
              {live.map((m, i) => <Bubble key={i} m={m} />)}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Спросите Абеке… (Enter — отправить, Shift+Enter — новая строка)"
            autoSize={{ minRows: 1, maxRows: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            disabled={busy}
          />
          {busy ? (
            <Button danger icon={<StopOutlined />} onClick={() => abortRef.current?.abort()}>Стоп</Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={() => ask(input)}
              disabled={!input.trim()}>Отправить</Button>
          )}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 4 }}>
          Абеке — бета-версия: проверяйте важное. Ответы опираются на базу знаний; данные он не меняет.
        </Typography.Text>
      </div>
      <KnowledgeBase open={kbOpen} onClose={() => setKbOpen(false)} />
      {!status.data && status.isError && <Empty description={errorMessage(status.error)} />}
    </div>
  );
}
