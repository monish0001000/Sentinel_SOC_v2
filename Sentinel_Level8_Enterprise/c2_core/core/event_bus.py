# core/event_bus.py
import asyncio
import os
import json
import redis
from collections import defaultdict

class EventBus:
    def __init__(self):
        self.subscribers = defaultdict(list)
        self.redis_client = None
        
        # Redis Connection with graceful fallback
        redis_host = os.getenv('REDIS_HOST', 'redis')
        try:
            self.redis_client = redis.Redis(host=redis_host, port=6379, db=0)
            self.redis_client.ping()
            print(f"[BUS] Connected to Redis at {redis_host}:6379")
        except Exception as e:
            print(f"[BUS] ⚠️ Redis connection failed ({e}). Running in Local-Only mode.")
            self.redis_client = None

    def subscribe(self, event_type, callback):
        self.subscribers[event_type].append(callback)

    async def publish(self, event_type, data):
        # 1. Local Dispatch (Legacy/Internal)
        if event_type in self.subscribers:
            for callback in self.subscribers[event_type]:
                if asyncio.iscoroutinefunction(callback):
                    asyncio.create_task(callback(data))
                else:
                    try:
                        callback(data)
                    except Exception as e:
                        print(f"[BUS] Sync callback error: {e}")
        
        # 2. Redis Publishing (Hybrid)
        if self.redis_client:
            try:
                # Ensure data is serializable. If it's a dict, strictly cast to ensure no non-serializable objects slip in if possible, 
                # but for now we trust the source to provide serializable data or rely on json.dumps to raise.
                # Common pattern: only publish if it looks like a proper event (not internal objects)
                
                payload = {
                    "type": event_type,
                    "data": data,
                    "source": "c2_core"
                }
                # Serialize and Publish
                message = json.dumps(payload, default=str) # default=str helps with datetime/other objects
                self.redis_client.publish('soc_logs', message)
                # print(f"[BUS] Published to Redis: {event_type}") 
            except Exception as e:
                print(f"[BUS] Failed to publish to Redis: {e}")
