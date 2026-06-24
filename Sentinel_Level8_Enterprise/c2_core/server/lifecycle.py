import socket
import sys
import psutil

def check_port(port: int, host: str = "0.0.0.0") -> bool:
    """
    Checks if a port is available.
    Returns True if available, False if in use.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False

def identify_process_on_port(port: int):
    """
    Attempts to identify the PID holding the port.
    """
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            for conn in proc.connections(kind='inet'):
                if conn.laddr.port == port:
                    return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return None

def verify_startup_ports():
    """
    Verifies critical ports (8000, 8765) are free.
    If not, prints a helpful error and exits.
    """
    critical_ports = [8000, 8765]
    has_error = False

    for port in critical_ports:
        if not check_port(port):
            has_error = True
            print(f"[CRITICAL] Port {port} is ALREADY IN USE.")
            proc = identify_process_on_port(port)
            if proc:
                print(f"    - Held by PID {proc.pid} ({proc.name()})")
                print(f"    - Try running: taskkill /F /PID {proc.pid}")
            else:
                print("    - Could not identify process. Check Permission or other users.")
    
    if has_error:
        print("\n[ERROR] Cannot start Sentinel SOC Server due to port conflicts.")
        print("Please terminate the conflicting processes and try again.")
        sys.exit(1)
