import asyncio
import psutil
import time
from core.event_bus import EventBus

class NetworkCollector:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.last_io = psutil.net_io_counters()
        self.last_time = time.time()

    async def start(self):
        while True:
            current_io = psutil.net_io_counters()
            current_time = time.time()
            
            # Calculate Rate (Bytes per second)
            time_delta = current_time - self.last_time
            if time_delta > 0:
                bytes_sent_sec = (current_io.bytes_sent - self.last_io.bytes_sent) / time_delta
                bytes_recv_sec = (current_io.bytes_recv - self.last_io.bytes_recv) / time_delta
                packets_sent_sec = (current_io.packets_sent - self.last_io.packets_sent) / time_delta
                packets_recv_sec = (current_io.packets_recv - self.last_io.packets_recv) / time_delta
            else:
                bytes_sent_sec = 0
                bytes_recv_sec = 0
                packets_sent_sec = 0
                packets_recv_sec = 0

            # Update last state
            self.last_io = current_io
            self.last_time = current_time
            
            # Active Connections count
            try:
                # 'inet' covers IPv4 and IPv6
                connections = len(psutil.net_connections(kind='inet'))
            except Exception:
                connections = 0

            event = {
                "packet_rate": int(packets_sent_sec + packets_recv_sec),
                "bytes_out": int(bytes_sent_sec),
                "bytes_in": int(bytes_recv_sec),
                "connections": connections,
                "timestamp": current_time
            }
            
            await self.bus.publish("metrics", event)
            await asyncio.sleep(1)
