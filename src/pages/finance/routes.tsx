/** Route registrations for the "finance" module. */
import type { RouteObject } from "react-router-dom";

import AccountingPeriodsPage from "@/pages/finance/AccountingPeriodsPage";
import ExpenseCategoriesPage from "@/pages/finance/ExpenseCategoriesPage";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import FinancialSummaryPage from "@/pages/finance/FinancialSummaryPage";
import PnLReportPage from "@/pages/finance/PnLReportPage";

export const financeRoutes: RouteObject[] = [
  { path: "/expenses", element: <ExpensesPage /> },
  { path: "/expense-categories", element: <ExpenseCategoriesPage /> },
  { path: "/accounting-periods", element: <AccountingPeriodsPage /> },
  { path: "/reports/pnl", element: <PnLReportPage /> },
  { path: "/reports/financial-summary", element: <FinancialSummaryPage /> },
];
