import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import "./index.css";
import App from "./App.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* sessionStorage: each tab keeps its own sign-in, so one browser can show the
        AP clerk and the controller side by side during the demo. */}
    <ConvexAuthProvider client={convex} storage={window.sessionStorage}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
