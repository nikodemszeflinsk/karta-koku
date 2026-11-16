import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import { LoginPage } from "./features/auth/LoginPage";
import { SetupPage } from "./features/auth/SetupPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { AppLayout, MorePage, NotFoundPage, RequireAuth } from "./features/layout/AppLayout";
import { VaultProvider } from "./features/vault/vault-context";

/** Code-split route: the page's module is downloaded on first visit. */
function lazy<M>(load: () => Promise<M>, pick: (m: M) => ComponentType): Pick<RouteObject, "lazy"> {
  return { lazy: async () => ({ Component: pick(await load()) }) };
}

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/setup", element: <SetupPage /> },
  { path: "/zaproszenie/:token", ...lazy(() => import("./features/team/InvitePage"), (m) => m.InvitePage) },
  {
    element: (
      <RequireAuth>
        <VaultProvider>
          <AppLayout />
        </VaultProvider>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "akademia", ...lazy(() => import("./features/academy/AcademyPage"), (m) => m.AcademyPage) },
      { path: "akademia/lekcja/nowa", ...lazy(() => import("./features/academy/LessonPage"), (m) => m.LessonNewPage) },
      { path: "akademia/lekcja/:id", ...lazy(() => import("./features/academy/LessonPage"), (m) => m.LessonPage) },
      { path: "trener", ...lazy(() => import("./features/coach/CoachPage"), (m) => m.CoachPage) },
      { path: "trener/ocena", ...lazy(() => import("./features/coach/EvaluatePage"), (m) => m.EvaluatePage) },
      { path: "trener/:id", ...lazy(() => import("./features/coach/CoachPage"), (m) => m.ChatPage) },
      { path: "egzaminy", ...lazy(() => import("./features/learning/ExamsPage"), (m) => m.ExamsPage) },
      { path: "egzaminy/:id", ...lazy(() => import("./features/learning/ExamsPage"), (m) => m.AttemptPage) },
      { path: "powtorki", ...lazy(() => import("./features/learning/ReviewsPage"), (m) => m.ReviewsPage) },
      { path: "postepy", ...lazy(() => import("./features/learning/ProgressPage"), (m) => m.ProgressPage) },
      { path: "skladniki", ...lazy(() => import("./features/ingredients/IngredientsPage"), (m) => m.IngredientsPage) },
      { path: "skladniki/nowy", ...lazy(() => import("./features/ingredients/IngredientFormPage"), (m) => m.IngredientNewPage) },
      { path: "skladniki/:id", ...lazy(() => import("./features/ingredients/IngredientDetailPage"), (m) => m.IngredientDetailPage) },
      { path: "skladniki/:id/edytuj", ...lazy(() => import("./features/ingredients/IngredientFormPage"), (m) => m.IngredientEditPage) },
      { path: "karta", ...lazy(() => import("./features/menu/MenuPage"), (m) => m.MenuPage) },
      { path: "karta/nowa", ...lazy(() => import("./features/menu/MenuItemPage"), (m) => m.MenuItemNewPage) },
      { path: "karta/:id", ...lazy(() => import("./features/menu/MenuItemPage"), (m) => m.MenuItemPage) },
      { path: "techniki", ...lazy(() => import("./features/techniques/TechniquesPage"), (m) => m.TechniquesPage) },
      { path: "receptury", ...lazy(() => import("./features/recipes/RecipesPage"), (m) => m.RecipesPage) },
      { path: "receptury/:id", ...lazy(() => import("./features/recipes/RecipesPage"), (m) => m.RecipeDetailPage) },
      { path: "notatnik", ...lazy(() => import("./features/notes/NotesPage"), (m) => m.NotesPage) },
      { path: "sejf", ...lazy(() => import("./features/vault/VaultPage"), (m) => m.VaultPage) },
      { path: "sejf/:id", ...lazy(() => import("./features/vault/VaultItemPage"), (m) => m.VaultItemPage) },
      { path: "szukaj", ...lazy(() => import("./features/search/SearchPage"), (m) => m.SearchPage) },
      { path: "zrodla", ...lazy(() => import("./features/sources/SourcesPage"), (m) => m.SourcesPage) },
      { path: "zespol", ...lazy(() => import("./features/team/TeamPage"), (m) => m.TeamPage) },
      { path: "wiecej", element: <MorePage /> },
      { path: "ustawienia", ...lazy(() => import("./features/settings/SettingsPage"), (m) => m.SettingsPage) },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
