/** Route registrations for the "finance" module. */
import type { RouteObject } from "react-router-dom";

import AbcReportPage from "@/pages/finance/AbcReportPage";
import CashFlowPage from "@/pages/finance/CashFlowPage";
import CompanyEntitiesPage from "@/pages/finance/CompanyEntitiesPage";
import CompanyMoneyPage from "@/pages/finance/CompanyMoneyPage";
import ExpenseCategoriesPage from "@/pages/finance/ExpenseCategoriesPage";
import ExpenseRegisterPage from "@/pages/finance/ExpenseRegisterPage";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import FinancialSummaryPage from "@/pages/finance/FinancialSummaryPage";
import PnLReportPage from "@/pages/finance/PnLReportPage";
import SalesByProductPage from "@/pages/finance/SalesByProductPage";
import SalesOlapPage from "@/pages/finance/SalesOlapPage";

export const financeRoutes: RouteObject[] = [
  // Наши юр. лица: реквизиты компаний и деньги по каждой из них.
  { path: "/company-entities", element: <CompanyEntitiesPage /> },
  { path: "/reports/company-entities", element: <CompanyMoneyPage /> },
  { path: "/expenses", element: <ExpensesPage /> },
  { path: "/reports/expenses", element: <ExpenseRegisterPage /> },
  { path: "/expense-categories", element: <ExpenseCategoriesPage /> },
  { path: "/reports/sales-by-product", element: <SalesByProductPage /> },
  { path: "/reports/sales-olap", element: <SalesOlapPage /> },
  { path: "/reports/abc", element: <AbcReportPage /> },
  { path: "/reports/cash-flow", element: <CashFlowPage /> },
  { path: "/reports/pnl", element: <PnLReportPage /> },
  { path: "/reports/financial-summary", element: <FinancialSummaryPage /> },
];
