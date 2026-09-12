/** Route registrations for the "inventory" module (склад + складские отчёты). */
import { Navigate, type RouteObject } from "react-router-dom";

import CountReportPage from "@/pages/inventory/CountReportPage";
import CountSessionPage from "@/pages/inventory/CountSessionPage";
import CountSessionsPage from "@/pages/inventory/CountSessionsPage";
import DocumentDetailPage from "@/pages/inventory/DocumentDetailPage";
import DocumentsPage from "@/pages/inventory/DocumentsPage";
import InvoiceDigitizePage from "@/pages/inventory/InvoiceDigitizePage";
import MovementsReportPage from "@/pages/inventory/MovementsReportPage";
import ProductCostReportPage from "@/pages/inventory/ProductCostReportPage";
import ProductMovementsReportPage from "@/pages/inventory/ProductMovementsReportPage";
import TrialBalancePage from "@/pages/inventory/TrialBalancePage";
import ProductionPlanPage from "@/pages/inventory/ProductionPlanPage";
import TransferPage from "@/pages/inventory/TransferPage";
import WarehousesPage from "@/pages/inventory/WarehousesPage";
import WriteOffEditorPage from "@/pages/inventory/WriteOffEditorPage";
import WriteOffsPage from "@/pages/inventory/WriteOffsPage";

export const inventoryRoutes: RouteObject[] = [
  { path: "/warehouses", element: <WarehousesPage /> },
  { path: "/documents", element: <DocumentsPage /> },
  { path: "/write-offs", element: <WriteOffsPage /> },
  { path: "/write-offs/new", element: <WriteOffEditorPage /> },
  { path: "/write-offs/:id", element: <WriteOffEditorPage /> },
  { path: "/transfer", element: <TransferPage /> },
  // Инвентаризация — сессия: список, лист пересчёта, отчёт. Прежний экран «всё
  // одним заходом» убран: он держал обход в браузере и терял его на закрытой
  // вкладке. Адрес /inventory-count тот же, поэтому закладки живы.
  { path: "/inventory-count", element: <CountSessionsPage /> },
  { path: "/inventory-count/:id", element: <CountSessionPage /> },
  { path: "/inventory-count/:id/report", element: <CountReportPage /> },
  { path: "/production-plan", element: <ProductionPlanPage /> },
  { path: "/documents/digitize", element: <InvoiceDigitizePage /> },
  { path: "/documents/:id", element: <DocumentDetailPage /> },
  // Остатки переехали на вкладку страницы складов; старые ссылки и закладки живы.
  { path: "/reports/stock", element: <Navigate to="/warehouses" replace /> },
  { path: "/reports/movements", element: <MovementsReportPage /> },
  { path: "/reports/product-movements", element: <ProductMovementsReportPage /> },
  { path: "/reports/trial-balance", element: <TrialBalancePage /> },
  { path: "/reports/product-cost", element: <ProductCostReportPage /> },
];
