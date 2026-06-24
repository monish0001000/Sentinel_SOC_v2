import asyncio
import os
import shutil
import hashlib
from datetime import datetime
import hashlib
try:
    import winreg
except ImportError:
    winreg = None

# Linux Compatibility Mock
class MockWinReg:
    HKEY_CURRENT_USER = "HKEY_CURRENT_USER"
    KEY_READ = 1
    KEY_WRITE = 2
    REG_SZ = 1
    
    class OpenKey:
        def __init__(*args): pass
        def __enter__(self): return self
        def __exit__(*args): pass

    @staticmethod
    def QueryValueEx(key, value_name):
        # Return dummy active status for Sentinel
        if value_name == "SentinelAgent":
            return ("D:\\Sentinel\\agent.exe", 1)
        return (None, 1)

    @staticmethod
    def SetValueEx(*args):
        pass

if not winreg:
    winreg = MockWinReg()
from datetime import datetime
from core.event_bus import EventBus

# Critical Files to Protect
PROTECTED_FILES = {
    "firewall_rules.json": "firewall_rules.json.bak",
    "core/firewall.py": "core/firewall.py.bak"
}

# Critical Registry Keys to Protect (Hive, Path, ValueName)
# We protect the "Run" key value for Sentinel (simulated persistence)
PROTECTED_REGISTRY_KEYS = [
    (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", "SentinelAgent")
]

class SelfHealingEngine:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.hashes = {}
        self.registry_baseline = {}
        self.active = True
        
        # Subscribe to FIM events if FIM publishes them, 
        # or we run our own periodic integrity check.
        # FIM in 'core/edr/fim.py' likely publishes 'file_modified'
        self.bus.subscribe("file_event", self.handle_file_event)
        
        # Create initial backups
        self._create_backups()

    def _create_backups(self):
        print("[SELF-HEALING] Creating baseline backups...")
        for filename, backup_name in PROTECTED_FILES.items():
            if os.path.exists(filename):
                try:
                    shutil.copy2(filename, backup_name)
                    self.hashes[filename] = self._get_hash(filename)
                    print(f"[SELF-HEALING] Protected: {filename}")
                except Exception as e:
                    print(f"[SELF-HEALING] Backup failed for {filename}: {e}")

        print("[SELF-HEALING] Creating registry baselines...")
        for hive, path, value_name in PROTECTED_REGISTRY_KEYS:
            val = self._get_registry_value(hive, path, value_name)
            if val is not None:
                self.registry_baseline[(hive, path, value_name)] = val
                print(f"[SELF-HEALING] Protected Registry: {path}\\{value_name}")
            else:
                 # If key doesn't exist, we might want to enforce it exists, or just ignore.
                 # For now, let's create a dummy entry if it's our test key
                 if value_name == "SentinelAgent":
                     self._set_registry_value(hive, path, value_name, "D:\\Sentinel\\agent.exe")
                     self.registry_baseline[(hive, path, value_name)] = "D:\\Sentinel\\agent.exe"
                     print(f"[SELF-HEALING] Created baseline for {path}\\{value_name}")

    def _get_hash(self, filepath):
        try:
            with open(filepath, "rb") as f:
                return hashlib.sha256(f.read()).hexdigest()
        except:
            return None

    def _get_registry_value(self, hive, subkey, value_name):
        if not winreg:
            return None
        try:
            with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ) as key:
                val, _ = winreg.QueryValueEx(key, value_name)
                return val
        except Exception:
            return None

    def _set_registry_value(self, hive, subkey, value_name, value):
        if not winreg:
            return False
        try:
            with winreg.OpenKey(hive, subkey, 0, winreg.KEY_WRITE) as key:
                winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, value)
                return True
        except Exception as e:
            print(f"[SELF-HEALING] Failed to write registry {subkey}: {e}")
            return False

    async def handle_file_event(self, event):
        """
        Triggered when FIM detects a change.
        """
        # event: { "type": "modified", "path": "..." }
        path = event.get("path")
        # Normalize path
        normalized_path = path.replace("\\", "/") if path else ""
        
        # Check if mapped
        if normalized_path in PROTECTED_FILES:
            current_hash = self._get_hash(normalized_path)
            original_hash = self.hashes.get(normalized_path)
            
            if current_hash != original_hash:
            
                print(f"[SELF-HEALING] Corruption detected in {normalized_path}! Initiating Rollback.")
                await self._restore_file(normalized_path)

    async def _check_registry_integrity(self):
        for (hive, path, name), baseline_val in self.registry_baseline.items():
            current_val = self._get_registry_value(hive, path, name)
            print(f"[DEBUG] Checking {name}: Curr={current_val} Exp={baseline_val}") # Debug
            if current_val != baseline_val:
                print(f"[SELF-HEALING] Registry Corruption detected: {path}\\{name} (Expected {baseline_val}, Got {current_val})")
                
                success = self._set_registry_value(hive, path, name, baseline_val)
                if success:
                    print(f"[SELF-HEALING] Registry Key RESTORED: {name}")
                    await self.bus.publish("alert", {
                        "message": f"Self-Healing System restored Registry Key: {name}",
                        "level": "CRITICAL",
                        "severity": "high",
                        "type": "Self-Healing",
                        "source": "Self-Healing Engine",
                        "timestamp": datetime.now().isoformat()
                    })

    async def _restore_file(self, filename):
        backup_name = PROTECTED_FILES.get(filename)
        if backup_name and os.path.exists(backup_name):
            try:
                # Restore
                shutil.copy2(backup_name, filename)
                print(f"[SELF-HEALING] Successfully RESTORED {filename} from backup.")
                
                # Check Hash again
                new_hash = self._get_hash(filename)
                self.hashes[filename] = new_hash
                
                await self.bus.publish("alert", {
                    "message": f"Self-Healing System restored corrupted file: {filename}",
                    "level": "CRITICAL",
                    "severity": "high",
                    "type": "Self-Healing",
                    "source": "Self-Healing Engine",
                    "timestamp": datetime.now().isoformat()
                })
                
            except Exception as e:
                print(f"[SELF-HEALING] Restore Failed: {e}")

    async def start(self):
        # We could also run a periodic loop here to check registry keys
        print("[SELF-HEALING] Active and monitoring.")
        while self.active:
            print("[DEBUG] Self-Healing Loop Tick")
            await asyncio.sleep(5) # Periodic check every 5 seconds (fast for demo)
            # Re-verify hashes just in case FIM missed it
            for f in PROTECTED_FILES:
                if os.path.exists(f):
                    curr = self._get_hash(f)
                    if curr != self.hashes.get(f):
                         print(f"[SELF-HEALING] Periodic Check found corruption in {f}")
                         await self._restore_file(f)
            
            # Check Registry
            await self._check_registry_integrity()
