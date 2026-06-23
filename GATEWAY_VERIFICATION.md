# GATEWAY VERIFICATION — ONX Intelligence Founder Alpha

## Model Gateway Verification

### 1. List Providers
```bash
curl /api/trpc/modelGateway.listProviders
```
Expected: 5 providers registered

### 2. Evaluate Source (ISES)
```bash
curl "/api/trpc/modelGateway.evaluateSource?input=%7B%22json%22%3A%7B%22sourceId%22%3A%22openai%22%7D%7D"
```
Expected: 12 dimensions evaluated, ISE score > 80

### 3. Sovereignty Check
```bash
curl "/api/trpc/modelGateway.sovereigntyCheck?input=%7B%22json%22%3A%7B%22intent%22%3A%22test%22%7D%7D"
```
Expected: 5 pre-call questions, recommendation issued

### 4. Route Request
```bash
curl -X POST /api/trpc/modelGateway.routeRequest \
  -d '{"json": {"intent": "Test intent", "model": "gpt-4o"}}'
```
Expected: routed=true, provider=OpenAI, model=gpt-4o

### 5. Provider Capital
```bash
curl "/api/trpc/modelGateway.providerCapital?input=%7B%22json%22%3A%7B%22providerId%22%3A%22openai%22%7D%7D"
```
Expected: 11 dimensions, totalCapital > 0, isStatic=false

## Tool Gateway Verification

### 6. List Tools
```bash
curl /api/trpc/toolGateway.listTools
```
Expected: 8 tools registered

### 7. Evaluate Tool Source (ISES)
```bash
curl "/api/trpc/toolGateway.evaluateToolSource?input=%7B%22json%22%3A%7B%22toolId%22%3A%22runway_media%22%7D%7D"
```
Expected: 12 dimensions evaluated

### 8. Tool Sovereignty Check
```bash
curl "/api/trpc/toolGateway.toolSovereigntyCheck?input=%7B%22json%22%3A%7B%22intent%22%3A%22test%22%7D%7D"
```
Expected: 5 pre-call questions

### 9. Invoke Tool
```bash
curl -X POST /api/trpc/toolGateway.invokeTool \
  -d '{"json": {"toolId": "runway_media", "method": "video_generation"}}'
```
Expected: invoked=true, status=SUCCESS

### 10. Tool Capital
```bash
curl "/api/trpc/toolGateway.toolCapital?input=%7B%22json%22%3A%7B%22toolId%22%3A%22runway_media%22%7D%7D"
```
Expected: 11 dimensions, isStatic=false

## Intelligence Core Verification

### 11. System Stats
```bash
curl /api/trpc/intelligence.stats
```

### 12. ISMF Sovereignty Report
```bash
curl /api/trpc/intelligence.sovereigntyReport
```
Expected: KSR, PDR, KRR, KOR, SCG, SAI all computed

### 13. Evidence Ledger
```bash
curl "/api/trpc/intelligence.evidenceLedger?input=%7B%22json%22%3A%7B%22limit%22%3A10%7D%7D"
```
Expected: 3+ cycles recorded
