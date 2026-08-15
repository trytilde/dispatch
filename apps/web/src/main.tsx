import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "@tryopenbot/ui/openbot-ui.css";
import { router } from "./router.js";

const root = document.getElementById("root");
if (!root) throw new Error("OpenBot root element is missing");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
