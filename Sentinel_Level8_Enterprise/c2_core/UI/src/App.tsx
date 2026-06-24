import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WebSocketProvider } from "@/hooks/useWebSocket";
import { TrafficProvider } from "@/context/TrafficContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import MobileAgent from "./pages/mobile/MobileAgent";
import DashboardLayout from "./layouts/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import LogsPage from "./pages/dashboard/LogsPage";
import ThreatsPage from "./pages/dashboard/ThreatsPage";
import AnalyticsPage from "./pages/dashboard/AnalyticsPage";
import AIAnalystPage from "./pages/dashboard/AIAnalystPage";
import FirewallPage from "./pages/dashboard/FirewallPage";
import TrafficPage from "./pages/dashboard/TrafficPage";
import PoliciesPage from './pages/dashboard/PoliciesPage';
import ForensicsPage from './pages/dashboard/ForensicsPage';
import NodesPage from './pages/dashboard/NodesPage';
import SettingsPage from "./pages/dashboard/SettingsPage";
import NotFound from "./pages/NotFound";
import { useState } from "react";
import { IntroAnimation } from "./components/IntroAnimation";
import { AnimatePresence } from "framer-motion";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { SystemStatusBanner } from "./components/SystemStatusBanner";

const queryClient = new QueryClient();

const App = () => {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <WebSocketProvider>
          <TrafficProvider>
            <SystemStatusBanner />
            <BrowserRouter>
            <AnimatePresence mode="wait">
              {showIntro ? (
                <IntroAnimation key="intro" onComplete={() => setShowIntro(false)} />
              ) : (
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/mobile-agent" element={<MobileAgent />} />

                  <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<DashboardHome />} />
                    <Route path="logs" element={<LogsPage />} />
                    <Route path="threats" element={<ThreatsPage />} />
                    <Route path="analytics" element={<AnalyticsPage />} />
                    <Route path="traffic" element={<TrafficPage />} />
                    <Route path="ai" element={<AIAnalystPage />} />
                    <Route path="firewall" element={<FirewallPage />} />
                    <Route path="policies" element={<PoliciesPage />} />
                    <Route path="forensics" element={<ForensicsPage />} />
                    <Route path="nodes" element={<NodesPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              )}
            </AnimatePresence>
          </BrowserRouter>
        </TrafficProvider>
      </WebSocketProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
