import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setUpServiceWorker } from "./lib/serviceWorker";

setUpServiceWorker();
if (import.meta.env.DEV) void import("./devHandle");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
