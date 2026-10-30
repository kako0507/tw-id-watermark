import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "./App.jsx";
import { createAppStore } from "./store/index.js";
import { loadSettings, persistSettings } from "./store/persistence.js";
import "./styles.css";

const store = createAppStore(loadSettings());
persistSettings(store);

// Expose the store in development for console inspection and automated tests
if (import.meta.env.DEV) window.__store = store;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
