/** Route registrations for the "delivery" module (paths fixed by layout/menu.ts). */
import type { RouteObject } from "react-router-dom";

import RoutesPage from "@/pages/delivery/RoutesPage";

export const deliveryRoutes: RouteObject[] = [
  { path: "/delivery", element: <RoutesPage /> },
];
