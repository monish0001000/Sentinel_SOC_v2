# collectors/system_logs.py
import psutil
import asyncio
import time

class SystemLogCollector:
    def __init__(self, bus):
        self.bus = bus

    async def start(self):
        while True:
            cpu = psutil.cpu_percent()
            mem = psutil.virtual_memory().percent

            event = {
                "type": "system",
                "cpu": cpu,
                "memory": mem,
                "timestamp": time.time()
            }
            print("[SYSTEM EVENT]", event) 
            
            await self.bus.publish("system_event", event)
            await asyncio.sleep(2)
