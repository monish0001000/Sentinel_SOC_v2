import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Bell, Moon, Globe, Lock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const SettingsPage = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    emailAlerts: true,
    criticalOnly: false,
    autoBlock: true,
    darkMode: true,
    timezone: "UTC",
    retentionDays: "90",
  });

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated successfully.",
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Configure your SOC dashboard preferences</p>
      </div>

      {/* Notification Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="cyber-border bg-card/50 backdrop-blur-sm rounded-lg p-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-foreground">Email Alerts</Label>
              <p className="text-sm text-muted-foreground">Receive threat alerts via email</p>
            </div>
            <Switch
              checked={settings.emailAlerts}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, emailAlerts: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-foreground">Critical Only</Label>
              <p className="text-sm text-muted-foreground">Only notify for critical threats</p>
            </div>
            <Switch
              checked={settings.criticalOnly}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, criticalOnly: checked }))
              }
            />
          </div>
        </div>
      </motion.div>

      {/* Security Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="cyber-border bg-card/50 backdrop-blur-sm rounded-lg p-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Security</h2>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-foreground">Auto-Block Threats</Label>
              <p className="text-sm text-muted-foreground">
                Automatically block suspicious IPs
              </p>
            </div>
            <Switch
              checked={settings.autoBlock}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, autoBlock: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Log Retention (Days)</Label>
            <Input
              type="number"
              value={settings.retentionDays}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, retentionDays: e.target.value }))
              }
              className="max-w-xs bg-background/50"
            />
          </div>
        </div>
      </motion.div>

      {/* Display Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="cyber-border bg-card/50 backdrop-blur-sm rounded-lg p-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Display</h2>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-foreground">Timezone</Label>
            <select
              value={settings.timezone}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, timezone: e.target.value }))
              }
              className="w-full max-w-xs px-3 py-2 rounded-md bg-background/50 border border-border text-foreground"
            >
              <option value="UTC">UTC</option>
              <option value="EST">Eastern Time (EST)</option>
              <option value="PST">Pacific Time (PST)</option>
              <option value="CET">Central European (CET)</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Save Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Button onClick={handleSave} className="gap-2">
          <Save className="w-4 h-4" />
          Save Settings
        </Button>
      </motion.div>
    </div>
  );
};

export default SettingsPage;
