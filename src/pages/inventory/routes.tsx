/** Route registrations for the "inventory" module (склад + складские отчёты). */
import { Navigate, type RouteObject } from "react-router-dom";

import DocumentDetailPage from "@/pages/inventory/DocumentDetailPage";
import DocumentsPage from "@/pages/inventory/DocumentsPage";
import InvoiceDigitizePage from "@/pages/inventory/InvoiceDigitizePage";
import MovementsReportPage from "@/pages/inventory/MovementsReportPage";
import ProductCostReportPage from "@/pages/inventory/ProductCostReportPage";
import ProductionPlanPage from "@/pages/inventory/ProductionPlanPage";
import StockCountPage from "@/pages/inventory/StockCountPage";
import WarehousesPage from "@/pages/inventory/WarehousesPage";

export const inventoryRoutes: RouteObject[] = [
  { path: "/warehouses", element: <WarehousesPage /> },
  { path: "/documents", element: <DocumentsPage /> },
  { path: "/inventory-count", element: <StockCountPage /> },
  { path: "/production-plan", element: <ProductionPlanPage /> },
  { path: "/documents/digitize", element: <InvoiceDigitizePage /> },
  { path: "/documents/:id", element: <DocumentDetailPage /> },
  // Остатки переехали на вкладку страницы складов; старые ссылки и закладки живы.
  { path: "/reports/stock", element: <Navigate to="/warehouses" replace /> },
  { path: "/reports/movements", element: <MovementsReportPage /> },
  { path: "/reports/product-cost", element: <ProductCostReportPage /> },
];
