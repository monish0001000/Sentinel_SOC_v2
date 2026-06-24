# core/event_bus.py
import asyncio
from collections import defaultdict

class EventBus:
    def __init__(self):
        self.subscribers = defaultdict(list)

    def subscribe(self, event_type, callback):
        self.subscribers[event_type].append(callback)

    async def publish(self, event_type, data):
        # print(f"[BUS] Publishing: {event_type}") # Debug
        if event_type in self.subscribers:
            for callback in self.subscribers[event_type]:
                if asyncio.iscoroutinefunction(callback):
                    asyncio.create_task(callback(data))
                else:
                    # Handle synchronous callbacks if any
                    try:
                        callback(data)
                    except Exception as e:
                        print(f"[BUS] Sync callback error: {e}")
