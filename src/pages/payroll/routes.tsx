/** Route registrations for the "payroll" module (paths fixed by layout/menu.ts). */
import type { RouteObject } from "react-router-dom";

import CompensationsPage from "@/pages/payroll/CompensationsPage";
import LoansPage from "@/pages/payroll/LoansPage";
import PayrollRunDetailPage from "@/pages/payroll/PayrollRunDetailPage";
import PayrollRunsPage from "@/pages/payroll/PayrollRunsPage";
import PaymentsPage from "@/pages/payroll/PaymentsPage";
import TimesheetPage from "@/pages/payroll/TimesheetPage";

export const payrollRoutes: RouteObject[] = [
  { path: "/payroll/compensations", element: <CompensationsPage /> },
  { path: "/payroll/timesheet", element: <TimesheetPage /> },
  { path: "/payroll/runs", element: <PayrollRunsPage /> },
  // Detail-страница в меню не входит, но роутом быть должна.
  { path: "/payroll/runs/:id", element: <PayrollRunDetailPage /> },
  { path: "/payroll/loans", element: <LoansPage /> },
  { path: "/payroll/payments", element: <PaymentsPage /> },
];
