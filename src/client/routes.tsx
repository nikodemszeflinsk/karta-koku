import type { RouteObject } from "react-router";
import { AcademyPage } from "./features/academy/AcademyPage";
import { LessonNewPage, LessonPage } from "./features/academy/LessonPage";
import { AttemptPage, ExamsPage } from "./features/learning/ExamsPage";
import { ProgressPage } from "./features/learning/ProgressPage";
import { ReviewsPage } from "./features/learning/ReviewsPage";
import { LoginPage } from "./features/auth/LoginPage";
import { SetupPage } from "./features/auth/SetupPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { IngredientDetailPage } from "./features/ingredients/IngredientDetailPage";
import { IngredientEditPage, IngredientNewPage } from "./features/ingredients/IngredientFormPage";
import { IngredientsPage } from "./features/ingredients/IngredientsPage";
import { ChatPage, CoachPage } from "./features/coach/CoachPage";
import { EvaluatePage } from "./features/coach/EvaluatePage";
import { AppLayout, MorePage, NotFoundPage, RequireAuth } from "./features/layout/AppLayout";
import { MenuItemNewPage, MenuItemPage } from "./features/menu/MenuItemPage";
import { MenuPage } from "./features/menu/MenuPage";
import { NotesPage } from "./features/notes/NotesPage";
import { RecipeDetailPage, RecipesPage } from "./features/recipes/RecipesPage";
import { SearchPage } from "./features/search/SearchPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { SourcesPage } from "./features/sources/SourcesPage";
import { TechniquesPage } from "./features/techniques/TechniquesPage";

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
      { path: "akademia/lekcja/nowa", element: <LessonNewPage /> },
      { path: "akademia/lekcja/:id", element: <LessonPage /> },
      { path: "egzaminy", element: <ExamsPage /> },
      { path: "egzaminy/:id", element: <AttemptPage /> },
      { path: "powtorki", element: <ReviewsPage /> },
      { path: "postepy", element: <ProgressPage /> },
      { path: "trener", element: <CoachPage /> },
      { path: "trener/ocena", element: <EvaluatePage /> },
      { path: "trener/:id", element: <ChatPage /> },
      { path: "skladniki", element: <IngredientsPage /> },
      { path: "skladniki/nowy", element: <IngredientNewPage /> },
      { path: "skladniki/:id", element: <IngredientDetailPage /> },
      { path: "skladniki/:id/edytuj", element: <IngredientEditPage /> },
      { path: "karta", element: <MenuPage /> },
      { path: "karta/nowa", element: <MenuItemNewPage /> },
      { path: "karta/:id", element: <MenuItemPage /> },
      { path: "techniki", element: <TechniquesPage /> },
      { path: "receptury", element: <RecipesPage /> },
      { path: "receptury/:id", element: <RecipeDetailPage /> },
      { path: "notatnik", element: <NotesPage /> },
      { path: "szukaj", element: <SearchPage /> },
      { path: "zrodla", element: <SourcesPage /> },
      { path: "wiecej", element: <MorePage /> },
      { path: "ustawienia", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
