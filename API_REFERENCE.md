# ONX Intelligence API Reference

## Base URL
http://localhost:3001/api/v1

## Authentication
All endpoints require Bearer token:
Authorization: Bearer <JWT_TOKEN>

## Endpoints

### POST /intelligence/answer-from-knowledge
Search internal knowledge base first, fallback to external provider.

**Request:**
```json
{
  "question": "What is ONX?",
  "language": "en",
  "minConfidence": 60
}
```

**Response (Internal):**
```json
{
  "answerSource": "INTERNAL",
  "answer": "ONX is a Civilization Operating System...",
  "confidence": 95,
  "knowledgeAssetId": "cmr7g5fnd...",
  "saved": 0.05
}
```

**Response (External Required):**
```json
{
  "answerSource": "PROVIDER",
  "answer": "[EXTERNAL_REQUIRED]...",
  "shouldSaveToKnowledge": true,
  "costIncurred": 0.05
}
```

### POST /intelligence/ingest-knowledge-asset
Save question+answer as knowledge asset.

**Request:**
```json
{
  "questionCanonical": "What is ONX?",
  "answer": "ONX is a Civilization Operating System.",
  "domain": "GENERAL",
  "confidenceScore": 95,
  "tags": ["ONX", "overview"]
}
```

**Response:**
```json
{
  "id": "cmr7g5fnd0000...",
  "action": "CREATED",
  "questionCanonical": "What is ONX?",
  "confidenceScore": 95
}
```

### GET /intelligence/self-sufficiency-metrics
Track AI independence percentage.

Query: `?days=30`

**Response:**
```json
{
  "currentSelfSufficiency": 87,
  "trend": "IMPROVING",
  "summary": {
    "totalQuestions": 100,
    "answeredFromKnowledge": 85,
    "answeredFromProvider": 10,
    "answeredHybrid": 5
  },
  "knowledge": {
    "totalAssets": 100,
    "totalValueUsd": 5000
  },
  "aiSummaryAr": "نسبة الاكتفاء الذاتي: 87%..."
}
```

### GET /intelligence/knowledge-value
Calculate knowledge corpus financial value.

**Response:**
```json
{
  "totalCorpusValueUsd": "5000.00",
  "totalCorpusValueSar": "18750.00",
  "roi": "150.00",
  "projections": {
    "oneYear": "15000.00",
    "fiveYear": "100000.00"
  },
  "wealthSummaryAr": "ثروة ONX المعرفية: 5000 دولار..."
}
```

### GET /intelligence/provider-comparison
Compare AI providers by cost and quality.

Query: `?days=30`

**Response:**
```json
{
  "period": "Last 30 days",
  "byProvider": [
    {
      "provider": "OPENAI",
      "modelId": "gpt-4o",
      "requests": 150,
      "costUsd": "2.50",
      "avgLatency": 1200
    }
  ]
}
```

### POST /intelligence/constitutional-audit
Run 7 Constitutional Principles check.

**Request:**
```json
{
  "sessionId": 1,
  "content": "Text to audit",
  "domain": "MEDICAL"
}
```

**Response:**
```json
{
  "passed": true,
  "compositeScore": 92,
  "principles": {
    "amanah": 95,
    "ihsan": 90,
    "adl": 95,
    "rahmah": 100,
    "hikmah": 85,
    "itqan": 90,
    "tawakkul": 95
  },
  "violations": []
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 403 | Forbidden (auth required) |
| 404 | Not Found |
| 500 | Server Error |
