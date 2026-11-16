import type { RouteObject } from "react-router";
import { AcademyPage } from "./features/academy/AcademyPage";
import { LoginPage } from "./features/auth/LoginPage";
import { SetupPage } from "./features/auth/SetupPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { AppLayout, NotFoundPage, RequireAuth } from "./features/layout/AppLayout";
import { SettingsPage } from "./features/settings/SettingsPage";

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/setup", element: <SetupPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "akademia", element: <AcademyPage /> },
      { path: "ustawienia", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
