/** Route registrations for the "requests" module (paths fixed by layout/menu.ts). */
import type { RouteObject } from "react-router-dom";

import AllRequestsPage from "@/pages/requests/AllRequestsPage";
import MyRequestsPage from "@/pages/requests/MyRequestsPage";
import RequestPoliciesPage from "@/pages/requests/RequestPoliciesPage";

export const requestsRoutes: RouteObject[] = [
  { path: "/my/requests", element: <MyRequestsPage /> },
  { path: "/requests", element: <AllRequestsPage /> },
  { path: "/request-policies", element: <RequestPoliciesPage /> },
];
