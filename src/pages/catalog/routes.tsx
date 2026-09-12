/** Route registrations for the "catalog" module. */
import type { RouteObject } from "react-router-dom";

import ProductsPage from "@/pages/catalog/ProductsPage";
import RecipeEditorPage from "@/pages/catalog/RecipeEditorPage";
import RecipesPage from "@/pages/catalog/RecipesPage";
import UnitsPage from "@/pages/catalog/UnitsPage";

export const catalogRoutes: RouteObject[] = [
  { path: "/products/ingredients", element: <ProductsPage /> },
  { path: "/products/semi-finished", element: <ProductsPage /> },
  { path: "/products/dishes", element: <ProductsPage /> },
  { path: "/products", element: <ProductsPage /> },
  { path: "/units", element: <UnitsPage /> },
  { path: "/recipes", element: <RecipesPage /> },
  { path: "/recipes/:id", element: <RecipeEditorPage /> },
];
