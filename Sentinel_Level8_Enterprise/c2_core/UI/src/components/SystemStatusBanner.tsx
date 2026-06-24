import { useWebSocket } from "@/hooks/useWebSocket";
import { AlertCircle, WifiOff } from "lucide-react";

export const SystemStatusBanner = () => {
  const { connectionStatus } = useWebSocket();

  if (connectionStatus === "connected" || connectionStatus === "connecting") {
    return null;
  }

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 font-semibold shadow-md animate-in slide-in-from-top duration-300 fixed top-0 left-0 right-0 z-50">
      <WifiOff className="h-5 w-5" />
      <span>SYSTEM DISCONNECTED - ATTEMPTING RECONNECT...</span>
      <AlertCircle className="h-5 w-5" />
    </div>
  );
};
