/** Route registrations for the "requests" module (paths fixed by layout/menu.ts). */
import type { RouteObject } from "react-router-dom";

import AllRequestsPage from "@/pages/requests/AllRequestsPage";
import ApprovalFlowsPage from "@/pages/requests/ApprovalFlowsPage";
import RequestPoliciesPage from "@/pages/requests/RequestPoliciesPage";
import RequestTemplatesPage from "@/pages/requests/RequestTemplatesPage";

export const requestsRoutes: RouteObject[] = [
  { path: "/requests", element: <AllRequestsPage /> },
  { path: "/requests/templates", element: <RequestTemplatesPage /> },
  { path: "/approval-flows", element: <ApprovalFlowsPage /> },
  { path: "/request-policies", element: <RequestPoliciesPage /> },
];
