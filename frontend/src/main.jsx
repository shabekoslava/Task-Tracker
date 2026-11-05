import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Шрифты собираются вместе с приложением: без запросов к Google Fonts,
// который может быть недоступен и тормозить загрузку страницы
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/onest/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
