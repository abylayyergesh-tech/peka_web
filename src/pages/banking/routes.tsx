/** Route registrations for the "banking" module (банковские выписки). */
import type { RouteObject } from "react-router-dom";

import BankStatementDetailPage from "@/pages/banking/BankStatementDetailPage";
import BankStatementsPage from "@/pages/banking/BankStatementsPage";

export const bankingRoutes: RouteObject[] = [
  { path: "/bank-statements", element: <BankStatementsPage /> },
  { path: "/bank-statements/:id", element: <BankStatementDetailPage /> },
];
