import time
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from core.event_bus import EventBus

import asyncio
from datetime import datetime

class FIMHandler(FileSystemEventHandler):
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.event_history = []
        self.heuristic_triggered = False
        # Capture main loop if running in connection with it, 
        # but safely we might need to be passed the loop.
        try:
            self.loop = asyncio.get_event_loop()
        except RuntimeError:
            self.loop = None


    def on_modified(self, event):
        if not event.is_directory:
            self.report("modified", event.src_path)

    def on_created(self, event):
        if not event.is_directory:
            self.report("created", event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            self.report("deleted", event.src_path)

    async def _publish(self, alert):
        await self.bus.publish("alert", alert)

    def report(self, action, path):
        # Filter out database journal/WAL files, logs, json rules, backups, and pycache to isolate false positives
        normalized = path.replace("\\", "/").lower()
        if (
            normalized.endswith((".db", ".db-journal", ".db-wal", ".db-shm", ".tmp")) or
            "__pycache__" in normalized or
            "debug" in normalized or
            normalized.endswith(".json") or
            normalized.endswith(".bak")
        ):
            return
            
        # print(f"[FIM] ALERT: File {action}: {path}")
        
        # --- Ransomware Heuristic: Mass Modification Detection ---
        now = time.time()
        # Clean old events (> 3 seconds ago)
        self.event_history = [t for t in self.event_history if now - t < 3.0]
        self.event_history.append(now)
        
        if len(self.event_history) > 30 and not self.heuristic_triggered:
            # HEURISTIC TRIGGERED
            print(f"[FIM] 🚨 RANSOMWARE BEHAVIOR DETECTED! (Mass File Mods: {len(self.event_history)}/3s)")
            self.heuristic_triggered = True
            
            alert = {
                "message": f"Ransomware Detected: Mass file modification in {os.path.dirname(path)}",
                "level": "critical",
                "severity": "high",
                "source": "EDR FIM",
                "type": "Ransomware",
                "timestamp": datetime.utcnow().isoformat(),
                "path": path
            }
            
            # Thread-safe publish
            if self.loop:
                asyncio.run_coroutine_threadsafe(
                    self._publish(alert),
                    self.loop
                )
            
            # Reset heuristic after a 5-second cooldown to enable multiple interactive tests
            import threading
            def reset_fim_heuristic():
                time.sleep(5.0)
                self.heuristic_triggered = False
                self.event_history = []
                print("[FIM] Heuristic reset. Ready for next detection.")
            threading.Thread(target=reset_fim_heuristic, daemon=True).start()
        
        # Publish individual low-level events only if needed? 
        # For now, just logging print is enough to keep bus clean, or send DEBUG event.


class FileIntegrityMonitor:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.observer = Observer()
        self.monitored_paths = [
            # In production: "C:\\Windows\\System32\\drivers\\etc",
            os.path.abspath("."), # Monitor current project dir for demo
        ]
        
    def start(self):
        handler = FIMHandler(self.bus)
        for path in self.monitored_paths:
            if os.path.exists(path):
                self.observer.schedule(handler, path, recursive=True)
                print(f"[FIM] Monitoring: {path}")
        
        self.observer.start()
        
    def stop(self):
        self.observer.stop()
        self.observer.join()
