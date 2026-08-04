/** /bank-statements — загруженные выписки + загрузка новой (cap payment.manage).
 *
 * Повторный файл бэкенд отклоняет по хешу (409), а повторные операции внутри
 * нового файла отсекает по отпечатку — поэтому в таблице видно две цифры: сколько
 * строк в файле и сколько из них новых.
 */
import { InboxOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, App, Space, Table, Tag, Tooltip, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorCode, errorMessage } from "@/api/client";
import { listStatements, uploadStatement, type BankStatementOut } from "@/api/banking";
import { useCan } from "@/auth/store";
import { Money, fmtDate, fmtDateTime } from "@/components/format";
import { usePagination } from "@/components/usePagination";

export default function BankStatementsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canManage = useCan("payment.manage");
  const { limit, offset, tablePagination } = usePagination();
  const [uploading, setUploading] = useState(false);

  const query = useQuery({
    queryKey: ["bank-statements", { limit, offset }],
    queryFn: () => listStatements({ limit, offset }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadStatement(file),
    onSuccess: (st) => {
      const repeats = st.parsed_count - st.imported_count;
      message.success(
        `Выписка загружена: строк ${st.parsed_count}, новых ${st.imported_count}` +
          (repeats > 0 ? `, повторов отсечено ${repeats}` : ""),
      );
      if (!st.balance_check_ok) {
        message.warning(
          "Итоги выписки не сходятся — часть строк могла не разобраться. " +
            "Разносить платежи по ней нельзя.",
          8,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
    },
    onError: (e) => {
      // Повторную загрузку показываем как предупреждение, а не как ошибку: это
      // штатная защита, а не поломка.
      if (errorCode(e) === "statement_already_loaded") {
        message.warning(errorMessage(e), 6);
      } else {
        message.error(errorMessage(e));
      }
    },
    onSettled: () => setUploading(false),
  });

  const columns: ColumnsType<BankStatementOut> = [
    {
      title: "Загружена",
      dataIndex: "created_at",
      width: 150,
      render: (v: string, row) => (
        <Link to={`/bank-statements/${row.bank_statement_id}`}>{fmtDateTime(v)}</Link>
      ),
    },
    {
      title: "Счёт",
      dataIndex: "account_iban",
      render: (v: string | null, row) => (
        <Space direction="vertical" size={0}>
          <span>{v ?? "—"}</span>
          <span style={{ color: "#999", fontSize: 12 }}>
            {[row.bank_name, row.owner_name].filter(Boolean).join(" · ")}
          </span>
        </Space>
      ),
    },
    {
      title: "Период",
      key: "period",
      width: 190,
      render: (_, row) =>
        row.period_from && row.period_to
          ? `${fmtDate(row.period_from)} — ${fmtDate(row.period_to)}`
          : "—",
    },
    {
      title: "Списано",
      dataIndex: "debit_total",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Поступило",
      dataIndex: "credit_total",
      width: 150,
      align: "right",
      render: (v: string) => <Money value={v} />,
    },
    {
      title: "Строк",
      key: "counts",
      width: 130,
      align: "right",
      render: (_, row) => {
        const repeats = row.parsed_count - row.imported_count;
        return (
          <Space size={4}>
            <span>{row.imported_count}</span>
            {repeats > 0 && (
              <Tooltip title={`${repeats} операций уже были загружены ранее`}>
                <Tag>+{repeats} повтор</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: "Сходимость",
      dataIndex: "balance_check_ok",
      width: 140,
      render: (ok: boolean, row) =>
        ok ? (
          <Tag color="green">сходится</Tag>
        ) : (
          <Tooltip title={row.warnings ?? "Входящий + кредит − дебет ≠ исходящий"}>
            <Tag color="red" icon={<WarningOutlined />}>
              не сходится
            </Tag>
          </Tooltip>
        ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Банковские выписки</h2>

      {canManage && (
        <Upload.Dragger
          accept=".xlsx,.xlsm"
          maxCount={1}
          showUploadList={false}
          disabled={uploading}
          beforeUpload={(file) => {
            setUploading(true);
            upload.mutate(file as unknown as File);
            return false; // загружаем сами через api, antd не трогает сеть
          }}
          style={{ marginBottom: 16 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {uploading ? "Загружаем…" : "Перетащите выписку (xlsx) или нажмите"}
          </p>
          <p className="ant-upload-hint">
            Один и тот же файл повторно не загрузится. Пересекающиеся периоды можно
            грузить смело — уже известные операции отсекаются.
          </p>
        </Upload.Dragger>
      )}

      {query.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={errorMessage(query.error)}
        />
      )}

      <Table
        rowKey="bank_statement_id"
        size="small"
        loading={query.isPending}
        dataSource={query.data?.items}
        pagination={tablePagination(query.data?.total)}
        columns={columns}
        locale={{ emptyText: "Выписок пока нет" }}
      />
    </div>
  );
}
