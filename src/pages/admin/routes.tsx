/** Route registrations for the "admin" module. */
import type { RouteObject } from "react-router-dom";

import MembersPage from "@/pages/admin/MembersPage";
import RolesPage from "@/pages/admin/RolesPage";

export const adminRoutes: RouteObject[] = [
  { path: "/members", element: <MembersPage /> },
  { path: "/roles", element: <RolesPage /> },
];
