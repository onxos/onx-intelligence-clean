# RUNWAY SETUP — ONX Intelligence Founder Alpha

## Integration: Tool Gateway ONLY
**No direct integration. Runway is accessed exclusively through the Tool Gateway.**

### Configuration
```bash
# Add to .env
RUNWAY_API_KEY=your-runway-api-key
RUNWAY_TOOL_ID=runway_media
```

### Verification
```bash
curl -X POST /api/trpc/toolGateway.invokeTool \
  -d '{"json": {"toolId": "runway_media", "method": "video_generation", "params": {"prompt": "Veterinary care promotional video", "duration": 30}}}'
```

### Expected Response
```json
{
  "invoked": true,
  "toolName": "Runway Media",
  "status": "SUCCESS",
  "gateway": "TOOL_GATEWAY"
}
```

### Tool Gateway Access
All Runway calls route through:
- `toolGateway.routeTool`
- `toolGateway.invokeTool`
- `toolGateway.checkToolHealth`

No direct Runway SDK calls in any other part of the system.
