import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "@trytilde/dispatch-ui/dispatch-ui.css";
import { initTheme } from "@trytilde/dispatch-ui";
import { router } from "./router.js";
import { AuthGate } from "./auth-gate.js";
import { ClientWorkspaceGate } from "./workspaces.js";

initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Dispatch root element is missing");

createRoot(root).render(
  <StrictMode>
    <ClientWorkspaceGate>
      <AuthGate skipOnboarding>
        <RouterProvider router={router} />
      </AuthGate>
    </ClientWorkspaceGate>
  </StrictMode>,
);
