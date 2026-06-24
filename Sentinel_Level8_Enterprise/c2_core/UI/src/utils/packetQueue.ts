/**
 * PacketQueue - Efficient buffer for managing network packets with memory limits
 * Features:
 * - Batches packets to reduce re-renders
 * - Maintains maximum size limit to control memory usage
 * - FIFO queue with efficient operations
 * - Preserves packet order (newest first)
 */

export interface PacketDPI {
    l3?: {
        version?: number;
        ttl?: number;
        protocol?: string;
        src_ip?: string;
        dst_ip?: string;
        flags?: string[];
    };
    l4?: {
        protocol?: string;
        src_port?: number;
        dst_port?: number;
        flags?: string[];
        window_size?: number;
    };
    service?: string;
}

export interface PacketEvent {
    id: string;
    uid?: string;
    src_ip: string;
    src_port: number;
    dst_ip: string;
    dst_port: number;
    protocol: string;
    status: string;
    pid: number;
    timestamp: string;
    // ── New DPI fields ──
    domain?: string;
    length?: number;
    process_name?: string;
    process_path?: string;
    process_cmdline?: string;
    process_user?: string;
    dpi?: PacketDPI;
    hex_dump?: string;
    direction?: string;
}

export class PacketQueue {
    private packets: PacketEvent[] = [];
    private maxSize: number;
    private pendingBatch: PacketEvent[] = [];
    private batchSize: number;

    /**
     * Initialize the packet queue
     * @param maxSize Maximum number of packets to keep (default: 1000)
     * @param batchSize Number of packets to accumulate before notifying listeners (default: 10)
     */
    constructor(maxSize: number = 1000, batchSize: number = 10) {
        this.maxSize = maxSize;
        this.batchSize = batchSize;
    }

    /**
     * Add a packet to the queue
     * Returns true if batch is ready, false otherwise
     */
    add(packet: PacketEvent): boolean {
        this.pendingBatch.push(packet);
        return this.pendingBatch.length >= this.batchSize;
    }

    /**
     * Flush pending packets and return them
     */
    flush(): PacketEvent[] {
        if (this.pendingBatch.length === 0) {
            return [];
        }

        // Add pending batch to main queue (newest first)
        this.packets = [...this.pendingBatch, ...this.packets];

        // Enforce size limit - keep only the newest maxSize packets
        if (this.packets.length > this.maxSize) {
            this.packets = this.packets.slice(0, this.maxSize);
        }

        const result = this.pendingBatch;
        this.pendingBatch = [];
        return result;
    }

    /**
     * Get all packets currently in queue
     */
    getAll(): PacketEvent[] {
        return [...this.packets];
    }

    /**
     * Get a slice of packets for virtualization
     */
    getRange(startIndex: number, endIndex: number): PacketEvent[] {
        return this.packets.slice(startIndex, endIndex);
    }

    /**
     * Get current queue size
     */
    size(): number {
        return this.packets.length;
    }

    /**
     * Check if there are pending packets
     */
    hasPending(): boolean {
        return this.pendingBatch.length > 0;
    }

    /**
     * Get pending batch size
     */
    pendingSize(): number {
        return this.pendingBatch.length;
    }

    /**
     * Clear the entire queue
     */
    clear(): void {
        this.packets = [];
        this.pendingBatch = [];
    }

    /**
     * Get memory estimate in KB (rough calculation)
     */
    getMemoryEstimate(): number {
        const packetSize = 500; // Approximate bytes per packet object
        return ((this.packets.length + this.pendingBatch.length) * packetSize) / 1024;
    }
}

/**
 * Hook version for React components - creates a managed queue instance
 */
export function usePacketQueue(maxSize: number = 1000, batchSize: number = 10) {
    return new PacketQueue(maxSize, batchSize);
}
