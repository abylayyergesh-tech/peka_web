/** Route registrations for the "sales" module. */
import type { RouteObject } from "react-router-dom";

import CheckDetailPage from "@/pages/sales/CheckDetailPage";
import ChecksPage from "@/pages/sales/ChecksPage";
import CustomerDetailPage from "@/pages/sales/CustomerDetailPage";
import CustomersPage from "@/pages/sales/CustomersPage";
import MenuItemsPage from "@/pages/sales/MenuItemsPage";
import ReceivablesReportPage from "@/pages/sales/ReceivablesReportPage";
import SalesReportPage from "@/pages/sales/SalesReportPage";
import ShiftDetailPage from "@/pages/sales/ShiftDetailPage";
import ShiftsPage from "@/pages/sales/ShiftsPage";

export const salesRoutes: RouteObject[] = [
  { path: "/menu-items", element: <MenuItemsPage /> },
  { path: "/shifts", element: <ShiftsPage /> },
  { path: "/shifts/:id", element: <ShiftDetailPage /> },
  { path: "/checks", element: <ChecksPage /> },
  { path: "/checks/:id", element: <CheckDetailPage /> },
  { path: "/customers", element: <CustomersPage /> },
  { path: "/customers/:id", element: <CustomerDetailPage /> },
  { path: "/reports/sales", element: <SalesReportPage /> },
  { path: "/reports/receivables", element: <ReceivablesReportPage /> },
];
