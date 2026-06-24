import psutil
import hashlib
import os
import time

class ProcessIdentity:
    def __init__(self):
        self._cache = {} # PID -> (Name, Path, Hash, Time)
        self._cache_ttl = 5.0 # Seconds

    def get_process_info(self, pid: int):
        """
        Resolves PID to {"name": str, "path": str, "hash": str, "signer": str}
        """
        now = time.time()
        
        # Check Cache
        if pid in self._cache:
            entry = self._cache[pid]
            if now - entry["timestamp"] < self._cache_ttl:
                return entry

        try:
            proc = psutil.Process(pid)
            name = proc.name()
            # exe = proc.exe() # Requires Privileges often
            
            # Simulated Signer Verification (Real would require pywin32 / pefile)
            signer = "Unknown"
            if name.lower() in ["chrome.exe", "msedge.exe"]:
                signer = "Google LLC" if "chrome" in name else "Microsoft Corporation"
            elif name.lower() in ["python.exe", "code.exe"]:
                signer = "Verified Developer"
            elif name.lower() in ["svchost.exe", "system"]:
                signer = "Microsoft Windows"
                
            info = {
                "name": name,
                "path": "restricted", # proc.exe() fails often without admin
                "hash": "simulated_hash",
                "signer": signer,
                "timestamp": now
            }
            
            try:
                 # Try to get path if possible
                 info["path"] = proc.exe()
            except:
                 pass

            self._cache[pid] = info
            return info

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None
        except Exception as e:
            # print(f"Proc ident error: {e}")
            return None
            
    def get_pid_using_port(self, port: int) -> int:
        """
        Finds the PID using a specific local port. Caches result for performance.
        """
        # 1. Check Port Cache (Separate cache for port->pid to avoid scan overhead)
        if not hasattr(self, "_port_cache"):
            self._port_cache = {} # port -> (pid, timestamp)
            
        now = time.time()
        if port in self._port_cache:
            pid, ts = self._port_cache[port]
            if now - ts < 2.0: # Short TTL for ports as they change fast
                return pid
                
        # 2. Scan Connections
        try:
            # This is expensive! Use with caution or specific filters if possible.
            # On Windows, 'inet' covers IPv4/IPv6 TCP/UDP
            for conn in psutil.net_connections(kind='inet'):
                if conn.laddr.port == port:
                    pid = conn.pid
                    self._port_cache[port] = (pid, now)
                    return pid
        except Exception:
            pass
            
        return None
            
