/** Route registrations for the "staff" (personnel + attendance) module. */
import type { RouteObject } from "react-router-dom";

import AttendancePage from "@/pages/staff/AttendancePage";
import DepartmentsPage from "@/pages/staff/DepartmentsPage";
import EmployeesPage from "@/pages/staff/EmployeesPage";
import MyAttendancePage from "@/pages/staff/MyAttendancePage";
import WorkLocationsPage from "@/pages/staff/WorkLocationsPage";

export const staffRoutes: RouteObject[] = [
  { path: "/employees", element: <EmployeesPage /> },
  { path: "/departments", element: <DepartmentsPage /> },
  { path: "/attendance", element: <AttendancePage /> },
  { path: "/work-locations", element: <WorkLocationsPage /> },
  { path: "/my/attendance", element: <MyAttendancePage /> },
];
