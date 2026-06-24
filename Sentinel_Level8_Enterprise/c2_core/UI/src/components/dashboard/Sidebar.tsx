import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Radio,
  AlertTriangle,
  BarChart3,
  Brain,
  Settings,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
  Network, // New import
  BrainCircuit, // New import
  ShieldCheck, // New import
  FileText, // New import
  Database, // New import
  Server, // New import
} from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/dashboard" },
  { icon: Network, label: "Live Traffic", path: "/dashboard/traffic" },
  { icon: BrainCircuit, label: "AI Analyst", path: "/dashboard/ai" },
  { icon: ShieldCheck, label: "Firewall Control", path: "/dashboard/firewall" },
  { icon: FileText, label: "Security Policies", path: "/dashboard/policies" },
  { icon: Database, label: "SIEM Forensics", path: "/dashboard/forensics" },
  { icon: Server, label: "EDR Nodes", path: "/dashboard/nodes" },
  { icon: Settings, label: "Settings", path: "/dashboard/settings" },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("sentinel_token");
    localStorage.removeItem("sentinel_role");
    navigate("/");
  };

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={cn(
        "relative h-screen glass-card-strong border-r border-border/50 flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-border/50">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <Shield className="w-7 h-7 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success rounded-full live-pulse" />
          </div>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-base text-foreground tracking-tight"
            >
              SENTINEL
            </motion.span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {menuItems.map((item) => {
          const userRole = localStorage.getItem("sentinel_role");

          // Role-based filtering
          if (userRole !== "admin") {
            if (item.label === "Settings" || item.label === "Firewall Control") {
              return null;
            }
          }

          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-colors",
                  isActive ? "text-primary" : "group-hover:text-primary"
                )}
              />
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>

      {/* Logout */}
      <div className="p-3 border-t border-border/50">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </motion.aside>
  );
};