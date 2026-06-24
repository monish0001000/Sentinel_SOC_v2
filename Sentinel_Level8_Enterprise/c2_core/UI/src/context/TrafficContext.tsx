import React, { createContext, useContext, useState, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { usePacketBufferWithPause } from '@/hooks/usePacketBuffer';
import { PacketEvent } from '@/utils/packetQueue';

interface TrafficContextType {
  packets: PacketEvent[];
  queueSize: number;
  memoryEstimate: number;
  isPaused: boolean;
  setIsPaused: (paused: boolean) => void;
  selectedPacketId: string | null;
  setSelectedPacketId: (id: string | null) => void;
  scrollOffset: number;
  setScrollOffset: (offset: number) => void;
  clearBuffer: () => void;
  filterExpression: string;
  setFilterExpression: (expr: string) => void;
  isScrolledToTop: boolean;
  setIsScrolledToTop: (scrolled: boolean) => void;
}

const TrafficContext = createContext<TrafficContextType | null>(null);

export const TrafficProvider = ({ children }: { children: React.ReactNode }) => {
  const { packetStream } = useWebSocket();
  const [isPaused, setIsPaused] = useState(false);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isScrolledToTop, setIsScrolledToTop] = useState(true);
  const [filterExpression, setFilterExpression] = useState('');

  // Use the packet buffer hook inside the provider to persist packets across unmounts
  const bufferResult = usePacketBufferWithPause(
    packetStream,
    isPaused,
    {
      batchInterval: 100,
      maxHistorySize: 1000,
      batchSize: 20,
    }
  );

  const { packets, queueSize, memoryEstimate, clear } = bufferResult;

  const clearBuffer = useCallback(() => {
    clear();
  }, [clear]);

  return (
    <TrafficContext.Provider
      value={{
        packets,
        queueSize,
        memoryEstimate,
        isPaused,
        setIsPaused,
        selectedPacketId,
        setSelectedPacketId,
        scrollOffset,
        setScrollOffset,
        clearBuffer,
        filterExpression,
        setFilterExpression,
        isScrolledToTop,
        setIsScrolledToTop,
      }}
    >
      {children}
    </TrafficContext.Provider>
  );
};

export const useTraffic = () => {
  const context = useContext(TrafficContext);
  if (!context) {
    throw new Error('useTraffic must be used within a TrafficProvider');
  }
  return context;
};
