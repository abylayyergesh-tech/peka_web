/** Route registrations for the "sales" module. */
import { Navigate, useLocation, type RouteObject } from "react-router-dom";

import AnnouncementsPage from "@/pages/sales/AnnouncementsPage";
import CheckDetailPage from "@/pages/sales/CheckDetailPage";
import CustomerDetailPage from "@/pages/sales/CustomerDetailPage";
import CustomersPage from "@/pages/sales/CustomersPage";
import MenuPage, { PRICE_LISTS_TAB } from "@/pages/sales/MenuPage";
import MenuPricesPage from "@/pages/sales/MenuPricesPage";
import ReceivablesReportPage from "@/pages/sales/ReceivablesReportPage";
import ReplacementsReportPage from "@/pages/sales/ReplacementsReportPage";
import SalesReportPage from "@/pages/sales/SalesReportPage";
import ShiftDetailPage from "@/pages/sales/ShiftDetailPage";
import ShiftsPage from "@/pages/sales/ShiftsPage";

/** /checks?shift=N → /shifts?shift=N. Вкладка «Чеки» больше не нужна. */
function ChecksRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.delete("tab");
  const next = params.toString();
  return <Navigate to={next ? `/shifts?${next}` : "/shifts"} replace />;
}

export const salesRoutes: RouteObject[] = [
  { path: "/menu-items", element: <MenuPage /> },
  // Список прайс-листов переехал во вкладку; ссылки и закладки живы.
  { path: "/menus", element: <Navigate to={PRICE_LISTS_TAB} replace /> },
  { path: "/menus/:id", element: <MenuPricesPage /> },
  { path: "/shifts", element: <ShiftsPage /> },
  { path: "/shifts/:id", element: <ShiftDetailPage /> },
  { path: "/checks", element: <ChecksRedirect /> },
  { path: "/checks/:id", element: <CheckDetailPage /> },
  { path: "/customers", element: <CustomersPage /> },
  { path: "/customers/:id", element: <CustomerDetailPage /> },
  { path: "/announcements", element: <AnnouncementsPage /> },
  { path: "/reports/sales", element: <SalesReportPage /> },
  { path: "/reports/receivables", element: <ReceivablesReportPage /> },
  { path: "/reports/replacements", element: <ReplacementsReportPage /> },
];
