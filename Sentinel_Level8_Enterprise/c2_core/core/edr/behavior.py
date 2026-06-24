import psutil
import time
import threading
import asyncio
from core.event_bus import EventBus
from datetime import datetime

class BehaviorEngine:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.running = False
        self.loop = asyncio.get_event_loop()
        self.suspicious_chains = [
            # Parent -> Child
            {"parent": "cmd.exe", "child": "powershell.exe"},
            {"parent": "winword.exe", "child": "powershell.exe"},
            {"parent": "excel.exe", "child": "cmd.exe"},
            {"parent": "svchost.exe", "child": "cmd.exe"},
            # Lateral Movement Indicators (WMI / Psexec)
            {"parent": "wmiprvse.exe", "child": "powershell.exe"},
            {"parent": "wmiprvse.exe", "child": "cmd.exe"},
            {"parent": "services.exe", "child": "cmd.exe"},
            {"parent": "services.exe", "child": "powershell.exe"}
        ]

    def get_process_tree(self, pid: int) -> dict:
        try:
            proc = psutil.Process(pid)
            tree = {
                "pid": proc.pid,
                "name": proc.name(),
                "ppid": proc.ppid(),
                "children": [self.get_process_tree(child.pid) for child in proc.children(recursive=False)]
            }
            return tree
        except psutil.NoSuchProcess:
            return {}

    def scan_processes(self):
        """
        Scans all running processes for suspicious parent-child relationships.
        """
        for proc in psutil.process_iter(['pid', 'name', 'ppid']):
            try:
                p_name = proc.info['name'].lower()
                
                # Check suspicious chains
                try:
                    parent = psutil.Process(proc.info['ppid'])
                    pp_name = parent.name().lower()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                
                for chain in self.suspicious_chains:
                    if pp_name == chain['parent'] and p_name == chain['child']:
                        msg = f"Suspicious Process Chain Detected: {pp_name} -> {p_name} (PID: {proc.info['pid']})"
                        print(f"[EDR] {msg}")
                        
                        # Publish Alert
                        alert_data = {
                            "message": msg,
                            "level": "CRITICAL",
                            "severity": "high",
                            "source": "EDR Behavior Engine",
                            "type": "Behavioral Anomaly",
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        
                        asyncio.run_coroutine_threadsafe(
                            self.bus.publish("alert", alert_data),
                            self.loop
                        )
                        
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

    def start_monitor(self):
        self.running = True
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.thread.start()
        print("[EDR] Behavior Monitor Started.")

    def _monitor_loop(self):
        while self.running:
            self.scan_processes()
            time.sleep(5) # Poll every 5 seconds
