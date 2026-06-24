# Quick Reference - Network Traffic Dashboard

## New Features at a Glance

### 📥 Export Traffic Logs (Blue Download Button)
Located in the top-right header next to memory indicator.

**What it does:**
- Exports all captured packets as a properly formatted CSV file
- Filename includes today's date: `network-traffic-YYYY-MM-DD.csv`
- Automatically downloads to your Downloads folder

**When it's available:**
- Only enabled when you have captured packets
- Grayed out when the traffic queue is empty

**CSV Contents:**
| Column | Example | Notes |
|--------|---------|-------|
| Timestamp | 2026-06-17T14:32:45 | Exact capture time |
| Protocol | TCP | TCP, UDP, or other |
| Source IP | 192.168.1.100 | Origin IP address |
| Source Port | 8080 | Origin port |
| Dest IP | 10.0.0.50 | Destination IP |
| Dest Port | 443 | Destination port |
| Status | allowed/blocked | Security status |
| PID | 2048 | Process ID |

---

### 🗑️ Clear Traffic Logs (Red Trash Button)
Located in the top-right header next to export button.

**What it does:**
- Removes all captured packets from memory
- Frees up system resources
- Clears display and resets counters

**When it's available:**
- Only enabled when you have captured packets
- Grayed out when traffic queue is empty

**Safety Features:**
1. Clicking the trash button shows a confirmation dialog
2. Dialog displays how many packets will be deleted
3. You must confirm with "Clear All" button
4. You can cancel with "Cancel" button or click outside dialog

**What happens after clearing:**
- Page reloads automatically (takes 1 second)
- All packets removed from memory
- Display returns to "WAITING FOR TRAFFIC..." state
- Memory indicator resets to 0 KB

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 🌐 Live Network Traffic                [📊] [⚠️] [📥] [🗑️] [⏸️] │
│ REAL-TIME PACKET INTERCEPTION // MONITORING INTERFACE            │
└─────────────────────────────────────────────────────────────────┘
    Legend:
    📊 = Flow Rate indicator (packets/sec)
    ⚠️  = Memory usage (KB)
    📥 = Export CSV (blue)
    🗑️  = Clear logs (red)
    ⏸️  = Pause/Resume (toggle)
```

---

## Common Workflows

### Workflow 1: Export for Compliance Report
1. Let traffic capture run for desired period
2. Click **Export** (blue download button)
3. CSV file downloads automatically
4. Open in Excel/Google Sheets for analysis
5. Filter/sort as needed for report

### Workflow 2: Free Up Memory
1. Monitor memory indicator in UI
2. If approaching high usage, click **Clear** (red trash)
3. Confirm deletion in popup dialog
4. Page reloads, memory resets
5. Resume traffic capture

### Workflow 3: Analyze Then Clear
1. Capture traffic for investigation
2. Review packets in the table
3. Scroll through data as needed
4. Export data if needed for records
5. Click **Clear** to reset for next session
6. Page reloads, ready for fresh capture

---

## Performance Tips

### Memory Usage Guidelines

| Scenario | Setting | Expected Memory |
|----------|---------|-----------------|
| Light traffic | Default (1000 packets max) | ~50 MB |
| Medium traffic | 2000 packets max | ~100 MB |
| High traffic | 500 packets max | ~25 MB |
| Forensic mode | 5000 packets max | ~250 MB |

### Reducing Memory Usage
If memory is high:
1. Click **Clear** to immediately free memory
2. Increase `batchInterval` to batch more (reduces renders)
3. Reduce `maxHistorySize` to keep fewer packets

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| (No keyboard shortcuts yet) | - |
| Planned in v3 | Vim-style navigation |

---

## Troubleshooting

### Export button is grayed out
- **Cause**: No packets captured yet
- **Solution**: Wait for traffic or check WebSocket connection

### Clear button is grayed out
- **Cause**: Queue is empty
- **Solution**: Normal state - traffic hasn't started yet

### Clear doesn't seem to work
- **Cause**: May take a few seconds for page reload
- **Solution**: Wait for page refresh, queue will reset

### CSV file appears to open in text viewer
- **Cause**: CSV is being opened with text editor instead of spreadsheet app
- **Solution**: Right-click file → "Open with" → Excel/Sheets

### Export file is empty or has no data
- **Cause**: Packets were cleared before export
- **Solution**: Recapture traffic, then export

---

## Keyboard Accessibility

All buttons support:
- ✅ Tab navigation
- ✅ Enter/Space to activate
- ✅ Screen reader labels via `title` attribute
- ✅ Disabled state indication

---

## Mobile Behavior

On mobile devices:
- Export works but may prompt save location
- Clear dialog shows at readable size
- Touch-friendly button sizing (48x48 minimum)
- Scrolling still smooth and responsive

---

## Data Privacy Notes

### What Gets Exported
- **Included**: Packet headers, timestamps, IPs, ports, status
- **Not included**: Packet payloads or raw data
- **Safe to share**: Yes, only headers are exported

### What Gets Cleared
- **Cleared**: All packet objects from memory
- **Not cleared**: Server logs or network records
- **Permanent**: Cannot be recovered after clear

---

## Related Features

| Feature | Status | Location |
|---------|--------|----------|
| Pause/Resume | ✅ Active | Gray button (right) |
| Flow Rate Monitor | ✅ Active | Top stats card |
| Memory Monitor | ✅ Active | Top stats card |
| Virtualization | ✅ Active | Scroll area (smooth) |
| Message Batching | ✅ Active | Automatic (100ms) |

---

## Get Help

For issues or questions:
1. Check [OPTIMIZATION_GUIDE.md](OPTIMIZATION_GUIDE.md) for advanced tuning
2. Review [UPDATE_SUMMARY.md](UPDATE_SUMMARY.md) for technical details
3. Check browser console (F12 → Console) for errors
4. Review React DevTools Profiler for performance issues

---

**Last Updated**: June 17, 2026
**Dashboard Version**: 2.1
**TypeScript Version**: 5.8+
**React Version**: 18.3+
