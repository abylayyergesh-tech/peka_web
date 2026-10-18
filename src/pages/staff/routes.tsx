/** Route registrations for the "staff" (personnel + attendance) module. */
import type { RouteObject } from "react-router-dom";

import AttendancePage from "@/pages/staff/AttendancePage";
import AttendanceSettingsPage from "@/pages/staff/AttendanceSettingsPage";
import DepartmentsPage from "@/pages/staff/DepartmentsPage";
import DeviceRequestsPage from "@/pages/staff/DeviceRequestsPage";
import DisciplinariesPage from "@/pages/staff/DisciplinariesPage";
import EmployeesPage from "@/pages/staff/EmployeesPage";
import MedicalBooksPage from "@/pages/staff/MedicalBooksPage";
import PositionsPage from "@/pages/staff/PositionsPage";
import SchedulePage from "@/pages/staff/SchedulePage";
import ShiftTemplatesPage from "@/pages/staff/ShiftTemplatesPage";
import WorkLocationsPage from "@/pages/staff/WorkLocationsPage";

export const staffRoutes: RouteObject[] = [
  { path: "/employees", element: <EmployeesPage /> },
  { path: "/employees/schedule", element: <SchedulePage /> },
  { path: "/shift-templates", element: <ShiftTemplatesPage /> },
  { path: "/employees/medical-books", element: <MedicalBooksPage /> },
  { path: "/employees/disciplinaries", element: <DisciplinariesPage /> },
  { path: "/departments", element: <DepartmentsPage /> },
  { path: "/attendance", element: <AttendancePage /> },
  { path: "/work-locations", element: <WorkLocationsPage /> },
  { path: "/positions", element: <PositionsPage /> },
  { path: "/device-requests", element: <DeviceRequestsPage /> },
  { path: "/attendance/settings", element: <AttendanceSettingsPage /> },
];
