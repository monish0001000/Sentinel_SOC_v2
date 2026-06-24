import asyncio
import websockets
import json
import psutil
import time
import socket
import platform
import os
import uuid
import argparse
import sys

# Ensure we can import capabilities if running from root or agent dir
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(current_dir)
sys.path.append(parent_dir)

try:
    from capabilities import AgentCapabilities
except ImportError:
    # Fallback if running from root without proper path
    try:
        from agent.capabilities import AgentCapabilities
    except ImportError:
        print("[AGENT] CRITICAL: Could not import AgentCapabilities.")
        sys.exit(1)

SERVER_IP = os.environ.get("SENTINEL_SERVER", "localhost")
SERVER_PORT = os.environ.get("SENTINEL_PORT", "8765")
SERVER_URL = f"ws://{SERVER_IP}:{SERVER_PORT}"
AGENT_ID_FILE = "agent_id.json"

class SentinelAgent:
    def __init__(self, server_ip=None):
        global SERVER_URL
        if server_ip:
            # If server_ip provided, assume default port or parse it?
            # Keeping it simple for now, just replace IP
            SERVER_URL = f"ws://{server_ip}:{SERVER_PORT}"
            
        self.agent_id = self.load_or_create_id()
        self.hostname = socket.gethostname()
        self.ip = self.get_ip()
        self.os_info = f"{platform.system()} {platform.release()}"
        self.running = True
        
        print(f"[AGENT] Initialized. ID: {self.agent_id} | Host: {self.hostname}")

        self.retry_delay = 2 # Initial backoff delay

    def load_or_create_id(self):
        current_hostname = socket.gethostname()
        path = os.path.join(os.path.dirname(__file__), AGENT_ID_FILE)
        
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                    return data.get("id", str(uuid.uuid4()))
            except:
                pass
        
        new_id = str(uuid.uuid4())
        with open(path, "w") as f:
            json.dump({"id": new_id, "hostname": current_hostname}, f)
        return new_id

    def get_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"

    def get_stats(self):
        return {
            "cpu": psutil.cpu_percent(),
            "memory": psutil.virtual_memory().percent,
            "disk": psutil.disk_usage('/').percent,
            "processes": len(psutil.pids())
        }

    async def send_telemetry(self, websocket):
        """
        Sends system telemetry to the C2 server.
        """
        stats = self.get_stats()
        telemetry_msg = {
            "type": "telemetry",
            "agent_id": self.agent_id,
            "data": stats
        }
        await websocket.send(json.dumps(telemetry_msg))
        # print(f"[AGENT] Sent Telemetry: CPU {stats['cpu']}%")

    async def execute_command(self, cmd_data):
        """
        Parses and executes a command received from the C2 server.
        """
        command = cmd_data.get("command")
        args = cmd_data.get("args", {})
        cmd_id = cmd_data.get("id")
        
        print(f"[AGENT] Received Command: {command}")
        
        result = {"status": "error", "message": "Unknown command"}
        
        if command == "kill_implant": # kill_process
            pid = args.get("pid")
            if pid:
                result = AgentCapabilities.kill_process(int(pid))
        
        elif command == "isolate_host":
            whitelist = args.get("whitelist", [])
            result = AgentCapabilities.isolate_network(whitelist)
            
        elif command == "lift_isolation":
            result = AgentCapabilities.lift_isolation()
            
        elif command == "ping":
            result = {"status": "success", "message": "pong"}

        # Return result
        response = {
            "type": "command_result",
            "cmd_id": cmd_id,
            "agent_id": self.agent_id,
            "result": result
        }
        return response

    async def telemetry_loop(self, websocket):
        """
        Runs in background, sending stats every 2 seconds.
        """
        try:
            while self.running:
                stats = self.get_stats()
                msg = {
                    "type": "telemetry",
                    "agent_id": self.agent_id,
                    "data": stats
                }
                await websocket.send(json.dumps(msg))
                print(f"[AGENT] 📤 Sent Telemetry: CPU {stats['cpu']}% | RAM {stats['memory']}%")
                await asyncio.sleep(2)
        except websockets.exceptions.ConnectionClosed:
            print("[AGENT] Telemetry Loop Stopped (Connection Closed)")
        except Exception as e:
            print(f"[AGENT] Telemetry Loop Error: {e}")

    async def run(self):
        while self.running:
            try:
                print(f"[AGENT] Connecting to C2: {SERVER_URL}")
                async with websockets.connect(SERVER_URL) as websocket:
                    self.retry_delay = 2 
                    
                    # 1. Register
                    reg_msg = {
                        "type": "agent_register",
                        "id": self.agent_id,
                        "hostname": self.hostname,
                        "ip": self.ip,
                        "os": self.os_info
                    }
                    await websocket.send(json.dumps(reg_msg))
                    print("[AGENT] Connected & Registered.")

                    # 2. Start Loops
                    telemetry_task = asyncio.create_task(self.telemetry_loop(websocket))
                    
                    try:
                        while True:
                            # Main Listener Loop
                            message = await websocket.recv()
                            data = json.loads(message)
                            
                            if data.get("type") == "command":
                                response = await self.execute_command(data)
                                await websocket.send(json.dumps(response))
                                await websocket.send(json.dumps({
                                    "type": "heartbeat",
                                    "timestamp": time.time()
                                }))
                                
                    except websockets.exceptions.ConnectionClosed:
                        print("[AGENT] Connection Closed. Reconnecting...")
                    except Exception as e:
                        print(f"[AGENT] Error: {e}")
                    finally:
                        telemetry_task.cancel()
                        
            except Exception as e:
                print(f"[AGENT] ⏳ Waiting for C2 Server to start... (Retry in {self.retry_delay}s)")
                await asyncio.sleep(self.retry_delay)
                self.retry_delay = min(self.retry_delay * 2, 60)
                            
            except Exception as e:
                print(f"[AGENT] ⏳ Waiting for C2 Server to start... (Retry in {self.retry_delay}s)")
                await asyncio.sleep(self.retry_delay)
                self.retry_delay = min(self.retry_delay * 2, 60) # Exponential backoff (max 60s)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default=None)
    args = parser.parse_args()
    
    agent = SentinelAgent(args.server)
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        print("[AGENT] Stopped.")
