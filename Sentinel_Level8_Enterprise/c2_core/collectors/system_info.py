import platform
import socket
import psutil
import asyncio

class SystemInfoCollector:
    def __init__(self, bus):
        self.bus = bus
        self.sent_info = False

    async def start(self):
        loop_counter = 0
        while True:
            # Resend static info every 5 seconds (every 5th iteration)
            if loop_counter % 5 == 0:
                mem = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
                
                info = {
                    "os": f"{platform.system()} {platform.release()}",
                    "hostname": socket.gethostname(),
                    "ip": socket.gethostbyname(socket.gethostname()),
                    "cpu_model": f"{platform.processor()}",
                    "cpu_count": psutil.cpu_count(),
                    "ram_total": f"{round(mem.total / (1024**3), 2)} GB",
                    "ram_used": f"{round(mem.used / (1024**3), 2)} GB",
                    "disk_total": f"{round(disk.total / (1024**3), 2)} GB",
                    "disk_free": f"{round(disk.free / (1024**3), 2)} GB"
                }
                await self.bus.publish("system_info", info)

            # Gather dynamic metrics (CPU/RAM) for the gauges
            cpu_percent = psutil.cpu_percent()
            mem_percent = psutil.virtual_memory().percent
            
            # Publish to 'metrics' channel so RealTimeStats updates the gauges
            metrics_event = {
                "cpu_usage": cpu_percent,
                "memory_usage": mem_percent
            }
            await self.bus.publish("metrics", metrics_event)
            
            loop_counter += 1
            # 1Hz update rate
            await asyncio.sleep(1)

