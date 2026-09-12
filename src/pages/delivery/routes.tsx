/** Route registrations for the "delivery" module (paths fixed by layout/menu.ts). */
import type { RouteObject } from "react-router-dom";

import AssignCouriersPage from "@/pages/delivery/AssignCouriersPage";
import DeliveryLayout from "@/pages/delivery/DeliveryLayout";
import DeliveryLogsPage from "@/pages/delivery/DeliveryLogsPage";
import RoutesPage from "@/pages/delivery/RoutesPage";

export const deliveryRoutes: RouteObject[] = [
  {
    path: "/delivery",
    element: <DeliveryLayout />,
    children: [
      { index: true, element: <RoutesPage /> },
      { path: "couriers", element: <AssignCouriersPage /> },
      { path: "logs", element: <DeliveryLogsPage /> },
    ],
  },
];
