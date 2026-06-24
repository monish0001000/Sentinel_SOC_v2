import psutil
import os
import subprocess
import platform
import logging

logger = logging.getLogger("sentinel.capabilities")

class AgentCapabilities:
    @staticmethod
    def kill_process(pid: int) -> dict:
        """
        Terminates a process by PID.
        """
        try:
            if not psutil.pid_exists(pid):
                return {"status": "error", "message": f"PID {pid} not found"}
            
            p = psutil.Process(pid)
            p_name = p.name()
            p.terminate()
            try:
                p.wait(timeout=3)
            except psutil.TimeoutExpired:
                p.kill()
            
            return {"status": "success", "message": f"Killed process {p_name} ({pid})"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def isolate_network(exclude_ips: list = None) -> dict:
        """
        Isolates the host using OS firewall (Windows Netsh / Linux Iptables).
        Allows only specific IPs (e.g. C2 Server).
        """
        if exclude_ips is None:
            exclude_ips = []
            
        system = platform.system()
        
        try:
            if system == "Windows":
                # 1. Block All Inbound/Outbound
                # Note: We must be careful not to kill our own C2 connection.
                # In a real scenario, we'd add Allow rules for exclude_ips FIRST.
                
                # Reset first to avoid lockouts from previous tests
                subprocess.run("netsh advfirewall reset", shell=True)
                
                # Allow C2 (Exclusions)
                for ip in exclude_ips:
                    subprocess.run(f"netsh advfirewall firewall add rule name=\"Sentinel_Allow_C2_{ip}\" dir=out action=allow remoteip={ip}", shell=True)
                    subprocess.run(f"netsh advfirewall firewall add rule name=\"Sentinel_Allow_C2_{ip}\" dir=in action=allow remoteip={ip}", shell=True)
                
                # Block Everything Else
                # subprocess.run("netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound", shell=True)
                # WARNING: The above command is too dangerous for a dev environment (locks user out of RDP/SSH).
                # We will simulate "Isolation" by blocking common ports (80, 443, 8080) except for C2.
                
                block_rules = [
                    "netsh advfirewall firewall add rule name=\"Sentinel_Iso_HTTP\" dir=out action=block protocol=TCP remoteport=80",
                    "netsh advfirewall firewall add rule name=\"Sentinel_Iso_HTTPS\" dir=out action=block protocol=TCP remoteport=443",
                    "netsh advfirewall firewall add rule name=\"Sentinel_Iso_DNS\" dir=out action=block protocol=UDP remoteport=53" 
                ]
                for cmd in block_rules:
                     subprocess.run(cmd, shell=True)
                     
                return {"status": "success", "mode": "Partial Isolation (Safe Mode)"}

            elif system == "Linux":
                # Iptables logic
                return {"status": "error", "message": "Linux isolation not yet implemented"}
                
            return {"status": "error", "message": "Unsupported OS"}
            
        except Exception as e:
            return {"status": "error", "message": str(e)}

    @staticmethod
    def lift_isolation() -> dict:
        """
        Removes isolation rules.
        """
        system = platform.system()
        if system == "Windows":
             subprocess.run("netsh advfirewall reset", shell=True)
             return {"status": "success", "message": "Isolation lifted"}
        return {"status": "ignored"}

    @staticmethod
    def get_file_hash(path: str) -> dict:
        import hashlib
        try:
            if not os.path.exists(path):
                return {"status": "error", "message": "File not found"}
                
            sha256_hash = hashlib.sha256()
            with open(path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return {"status": "success", "hash": sha256_hash.hexdigest()}
        except Exception as e:
             return {"status": "error", "message": str(e)}
