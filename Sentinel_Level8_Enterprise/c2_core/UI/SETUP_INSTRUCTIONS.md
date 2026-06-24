# Installation & Setup Instructions

## Prerequisites
- Node.js 18+
- Bun (for package management)

## Installation Steps

### 1. Install Dependencies
```bash
cd c2_core/UI
bun install
# or
npm install
```

This will automatically install the newly added `react-window` package.

### 2. Verify Installation
```bash
# Check that react-window is installed
ls node_modules/react-window
# or on Windows
dir node_modules\react-window
```

### 3. Build
```bash
bun run build
# or
npm run build
```

### 4. Development Server
```bash
bun run dev
# or
npm run dev
```

## File Structure

```
c2_core/UI/src/
├── hooks/
│   ├── useWebSocket.tsx          (existing - WebSocket context)
│   └── usePacketBuffer.ts        (NEW - Batching & buffering)
├── utils/
│   └── packetQueue.ts            (NEW - Queue management)
└── pages/dashboard/
    └── TrafficPage.tsx           (UPDATED - Virtualized with react-window)
```

## New Imports in Project

The TrafficPage now uses:
```typescript
import { FixedSizeList as List } from 'react-window';
import { usePacketBufferWithPause } from '@/hooks/usePacketBuffer';
import { PacketEvent } from '@/utils/packetQueue';
```

## Configuration

Edit these settings in [TrafficPage.tsx](src/pages/dashboard/TrafficPage.tsx):

```typescript
const { packets, queueSize, memoryEstimate } = usePacketBufferWithPause(
    packetStream,
    isPaused,
    {
        batchInterval: 100,        // ← Adjust update frequency
        maxHistorySize: 1000,      // ← Adjust history limit
        batchSize: 20,             // ← Adjust batch threshold
    }
);
```

## Performance Tips

### For Testing
- Set `batchInterval: 50` for faster feedback
- Set `maxHistorySize: 100` to see memory limits quickly

### For Production
- Keep defaults: `batchInterval: 100`, `maxHistorySize: 1000`
- Monitor memory via UI indicator

### For High-Load Networks
- Increase `batchInterval` to 150-200ms
- Reduce `maxHistorySize` to 500
- Increase `batchSize` to 30-50

## Troubleshooting

### "react-window not found" error
```bash
# Reinstall dependencies
rm -rf node_modules
bun install
```

### Build fails
```bash
# Clear build cache
rm -rf dist
bun run build
```

### Memory still high
- Check console for WebSocket warnings
- Verify `maxHistorySize` is being respected
- Profile in Chrome DevTools

## Monitoring

Use the Real-time Metrics displayed in the UI:
- **Queue**: Shows current packet count
- **Memory**: Shows approximate KB usage
- **Flow Rate**: Shows packets/second
- **Live/Paused**: Shows capture state

## Next Steps

1. Test with your environment
2. Adjust `batchInterval` and `maxHistorySize` to suit your needs
3. Monitor performance in browser DevTools Profiler
4. Read [OPTIMIZATION_GUIDE.md](OPTIMIZATION_GUIDE.md) for advanced tuning

## Support

For issues or questions:
1. Check browser console for errors
2. Review React DevTools Profiler tab
3. Check WebSocket connection status
4. Refer to OPTIMIZATION_GUIDE.md troubleshooting section
