/** Route registrations for the "inventory" module (склад + складские отчёты). */
import type { RouteObject } from "react-router-dom";

import DocumentDetailPage from "@/pages/inventory/DocumentDetailPage";
import DocumentsPage from "@/pages/inventory/DocumentsPage";
import InvoiceDigitizePage from "@/pages/inventory/InvoiceDigitizePage";
import MovementsReportPage from "@/pages/inventory/MovementsReportPage";
import ProductCostReportPage from "@/pages/inventory/ProductCostReportPage";
import StockReportPage from "@/pages/inventory/StockReportPage";
import WarehousesPage from "@/pages/inventory/WarehousesPage";

export const inventoryRoutes: RouteObject[] = [
  { path: "/warehouses", element: <WarehousesPage /> },
  { path: "/documents", element: <DocumentsPage /> },
  { path: "/documents/digitize", element: <InvoiceDigitizePage /> },
  { path: "/documents/:id", element: <DocumentDetailPage /> },
  { path: "/reports/stock", element: <StockReportPage /> },
  { path: "/reports/movements", element: <MovementsReportPage /> },
  { path: "/reports/product-cost", element: <ProductCostReportPage /> },
];
