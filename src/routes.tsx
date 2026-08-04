import { Result } from "antd";
import { createBrowserRouter } from "react-router-dom";

import ForgotPasswordPage from "@/auth/ForgotPasswordPage";
import InviteAcceptPage from "@/auth/InviteAcceptPage";
import LoginPage from "@/auth/LoginPage";
import RegisterPage from "@/auth/RegisterPage";
import RequireAuth from "@/auth/RequireAuth";
import ResetPasswordPage from "@/auth/ResetPasswordPage";
import AppLayout from "@/layout/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import { adminRoutes } from "@/pages/admin/routes";
import { bankingRoutes } from "@/pages/banking/routes";
import { catalogRoutes } from "@/pages/catalog/routes";
import { financeRoutes } from "@/pages/finance/routes";
import { inventoryRoutes } from "@/pages/inventory/routes";
import { payrollRoutes } from "@/pages/payroll/routes";
import { procurementRoutes } from "@/pages/procurement/routes";
import { requestsRoutes } from "@/pages/requests/routes";
import { salesRoutes } from "@/pages/sales/routes";
import { staffRoutes } from "@/pages/staff/routes";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password/:token", element: <ResetPasswordPage /> },
  { path: "/invite/:token", element: <InviteAcceptPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          ...catalogRoutes,
          ...inventoryRoutes,
          ...procurementRoutes,
          ...salesRoutes,
          ...financeRoutes,
          ...bankingRoutes,
          ...staffRoutes,
          ...payrollRoutes,
          ...requestsRoutes,
          ...adminRoutes,
          {
            path: "*",
            element: <Result status="404" title="Страница не найдена" />,
          },
        ],
      },
    ],
  },
]);
