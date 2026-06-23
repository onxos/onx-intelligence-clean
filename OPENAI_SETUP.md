# OPENAI SETUP — ONX Intelligence Founder Alpha

## Integration: Model Gateway ONLY
**No direct integration. OpenAI is accessed exclusively through the Model Gateway.**

### Configuration
```bash
# Add to .env
OPENAI_API_KEY=sk-your-openai-api-key
DEFAULT_PROVIDER=openai
```

### Verification
```bash
curl -X POST /api/trpc/modelGateway.routeRequest \
  -d '{"json": {"intent": "Analyze Q4 financial projections", "model": "gpt-4o"}}'
```

### Expected Response
```json
{
  "routed": true,
  "providerName": "OpenAI",
  "model": "gpt-4o",
  "gateway": "MODEL_GATEWAY"
}
```

### Model Gateway Access
All OpenAI calls route through:
- `modelGateway.routeRequest`
- `modelGateway.evaluateSource` (ISES)
- `modelGateway.sovereigntyCheck`
- `modelGateway.providerCapital`

No direct OpenAI SDK calls in any other part of the system.
