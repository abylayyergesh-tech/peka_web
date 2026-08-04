/** Route registrations for the "finance" module. */
import type { RouteObject } from "react-router-dom";

import AbcReportPage from "@/pages/finance/AbcReportPage";
import CashFlowPage from "@/pages/finance/CashFlowPage";
import ExpenseCategoriesPage from "@/pages/finance/ExpenseCategoriesPage";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import FinancialSummaryPage from "@/pages/finance/FinancialSummaryPage";
import PnLReportPage from "@/pages/finance/PnLReportPage";
import SalesByProductPage from "@/pages/finance/SalesByProductPage";

export const financeRoutes: RouteObject[] = [
  { path: "/expenses", element: <ExpensesPage /> },
  { path: "/expense-categories", element: <ExpenseCategoriesPage /> },
  { path: "/reports/sales-by-product", element: <SalesByProductPage /> },
  { path: "/reports/abc", element: <AbcReportPage /> },
  { path: "/reports/cash-flow", element: <CashFlowPage /> },
  { path: "/reports/pnl", element: <PnLReportPage /> },
  { path: "/reports/financial-summary", element: <FinancialSummaryPage /> },
];
