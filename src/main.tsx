import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp, ConfigProvider } from "antd";
import ruRU from "antd/locale/ru_RU";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import ErrorBoundary from "@/components/ErrorBoundary";
import { router } from "@/routes";
import { theme } from "@/theme";
import "antd/dist/reset.css";
// После reset.css: наши правила должны его перебивать, а не наоборот.
import "@/index.css";

dayjs.locale("ru");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={ruRU} theme={theme}>
      <AntApp>
        {/* Внешняя граница: ловит то, что выше layout — провайдеры и сам
            маршрутизатор. Внутренняя (в AppLayout) сохраняет меню. */}
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
