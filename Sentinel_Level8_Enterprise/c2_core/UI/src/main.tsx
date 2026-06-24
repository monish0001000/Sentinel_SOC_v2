import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// 🔥 IMPORTANT: Import WebSocketProvider
import { WebSocketProvider } from "./hooks/useWebSocket";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* 🔗 Wrap entire app with Sentinel WebSocket Provider */}
    <WebSocketProvider>
      <App />
    </WebSocketProvider>
  </React.StrictMode>
);
