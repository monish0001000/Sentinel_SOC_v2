import { useEffect, useRef, useCallback, useState } from 'react';
import { PacketEvent, PacketQueue } from '@/utils/packetQueue';

/**
 * usePacketBuffer - Batches incoming WebSocket packets and reduces re-renders
 * 
 * This hook:
 * - Buffers individual packets into batches
 * - Updates state at a controlled interval (default 100ms)
 * - Prevents excessive re-renders
 * - Maintains memory limits automatically
 * - Provides smooth scrolling without jank
 */
export function usePacketBuffer(
    incomingPacket: PacketEvent | null,
    options?: {
        batchInterval?: number;  // ms between flushes (default: 100)
        maxHistorySize?: number; // max packets to keep (default: 1000)
        batchSize?: number;      // packets per batch (default: 10)
    }
) {
    const {
        batchInterval = 100,
        maxHistorySize = 1000,
        batchSize = 10,
    } = options || {};

    const queueRef = useRef(new PacketQueue(maxHistorySize, batchSize));
    const [packets, setPackets] = useState<PacketEvent[]>([]);
    const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isFlushingRef = useRef(false);

    // Scheduled flush function
    const scheduleFlush = useCallback(() => {
        if (flushTimeoutRef.current) {
            clearTimeout(flushTimeoutRef.current);
        }

        if (!isFlushingRef.current) {
            flushTimeoutRef.current = setTimeout(() => {
                isFlushingRef.current = true;
                const queue = queueRef.current;
                const flushed = queue.flush();

                if (flushed.length > 0) {
                    setPackets(queue.getAll());
                }

                isFlushingRef.current = false;
            }, batchInterval);
        }
    }, [batchInterval]);

    // Handle incoming packets
    useEffect(() => {
        if (!incomingPacket) return;

        const queue = queueRef.current;
        const isBatchReady = queue.add(incomingPacket);

        // Flush immediately if batch is ready, otherwise schedule
        if (isBatchReady) {
            if (flushTimeoutRef.current) {
                clearTimeout(flushTimeoutRef.current);
            }
            isFlushingRef.current = true;
            const flushed = queue.flush();
            setPackets(queue.getAll());
            isFlushingRef.current = false;
        } else {
            scheduleFlush();
        }
    }, [incomingPacket, scheduleFlush]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (flushTimeoutRef.current) {
                clearTimeout(flushTimeoutRef.current);
            }
        };
    }, []);

    const manualFlush = useCallback(() => {
        const queue = queueRef.current;
        const flushed = queue.flush();
        if (flushed.length > 0) {
            setPackets(queue.getAll());
        }
    }, []);

    const manualClear = useCallback(() => {
        queueRef.current.clear();
        setPackets([]);
    }, []);

    return {
        packets,
        queueSize: queueRef.current.size(),
        pendingSize: queueRef.current.pendingSize(),
        memoryEstimate: queueRef.current.getMemoryEstimate(),
        flush: manualFlush,
        clear: manualClear,
    };
}

/**
 * Advanced version with pause/resume capability
 */
export function usePacketBufferWithPause(
    incomingPacket: PacketEvent | null,
    isPaused: boolean = false,
    options?: {
        batchInterval?: number;
        maxHistorySize?: number;
        batchSize?: number;
    }
) {
    const result = usePacketBuffer(isPaused ? null : incomingPacket, options);

    return result;
}
