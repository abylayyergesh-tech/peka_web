/** Route registrations for the "staff" (personnel + attendance) module. */
import type { RouteObject } from "react-router-dom";

import AttendancePage from "@/pages/staff/AttendancePage";
import DepartmentsPage from "@/pages/staff/DepartmentsPage";
import DisciplinariesPage from "@/pages/staff/DisciplinariesPage";
import EmployeesPage from "@/pages/staff/EmployeesPage";
import MedicalBooksPage from "@/pages/staff/MedicalBooksPage";
import SchedulePage from "@/pages/staff/SchedulePage";
import WorkLocationsPage from "@/pages/staff/WorkLocationsPage";

export const staffRoutes: RouteObject[] = [
  { path: "/employees", element: <EmployeesPage /> },
  { path: "/employees/schedule", element: <SchedulePage /> },
  { path: "/employees/medical-books", element: <MedicalBooksPage /> },
  { path: "/employees/disciplinaries", element: <DisciplinariesPage /> },
  { path: "/departments", element: <DepartmentsPage /> },
  { path: "/attendance", element: <AttendancePage /> },
  { path: "/work-locations", element: <WorkLocationsPage /> },
];
