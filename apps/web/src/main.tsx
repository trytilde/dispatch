import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router.js";
import { AuthGate } from "./auth-gate.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("OpenBot root element is missing");

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  </StrictMode>,
);
