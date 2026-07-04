/** limit/offset state wired to the antd Table pagination control. */
import type { TablePaginationConfig } from "antd";
import { useState } from "react";

export function usePagination(defaultPageSize = 20) {
  const [limit, setLimit] = useState(defaultPageSize);
  const [offset, setOffset] = useState(0);

  function tablePagination(total: number | undefined): TablePaginationConfig {
    return {
      total: total ?? 0,
      pageSize: limit,
      current: Math.floor(offset / limit) + 1,
      showSizeChanger: true,
      showTotal: (t) => `Всего: ${t}`,
      onChange: (page, pageSize) => {
        setLimit(pageSize);
        setOffset((page - 1) * pageSize);
      },
    };
  }

  /** Reset to page 1 (call when filters change). */
  function reset() {
    setOffset(0);
  }

  return { limit, offset, tablePagination, reset };
}
