/** Route registrations for the "procurement" module. */
import type { RouteObject } from "react-router-dom";

import PayablesReportPage from "@/pages/procurement/PayablesReportPage";
import SupplierReconciliationPage from "@/pages/procurement/SupplierReconciliationPage";
import PurchaseOrderDetailPage from "@/pages/procurement/PurchaseOrderDetailPage";
import PurchaseOrdersPage from "@/pages/procurement/PurchaseOrdersPage";
import SupplierDetailPage from "@/pages/procurement/SupplierDetailPage";
import SuppliersPage from "@/pages/procurement/SuppliersPage";

export const procurementRoutes: RouteObject[] = [
  { path: "/suppliers", element: <SuppliersPage /> },
  { path: "/suppliers/:id", element: <SupplierDetailPage /> },
  { path: "/purchase-orders", element: <PurchaseOrdersPage /> },
  { path: "/purchase-orders/:id", element: <PurchaseOrderDetailPage /> },
  { path: "/reports/payables", element: <PayablesReportPage /> },
  { path: "/reports/supplier-reconciliation", element: <SupplierReconciliationPage /> },
];
