# Corpus Ingestion — activation guide

The corpus domain ships a complete, honest, **measured** knowledge pipeline. It
is populated today with a small, real, provenance-valid seed (49 authored
veterinary standard-of-care records + 7 ONX constitutional principles = **56
provenance-valid canonical records**). It is wired to ingest a licensed/open
bulk dataset the moment one is authorised — **without any code change**.

No data is fabricated or procedurally generated into the counted set. Reaching
the 25,000 canonical-record floor requires a real external source (below); this
is a sourcing decision, not a code gap.

## 1. The ready pipeline

Every record flows through the same deterministic, measured lifecycle:

```
ingest → dedupe → provenance-gate → quality-score → index → retrieve → export → verify
```

| Stage | Where | What it guarantees |
|-------|-------|--------------------|
| **ingest** | `scripts/seed-corpus.ts` | authored / ingested / labeled-synthetic seeds → `CorpusObject`s |
| **dedupe** | `contentHash()` (`api/lib/corpus.ts`) | sha256 content identity; reseeds are idempotent — counts never inflate |
| **provenance-gate** | `isProvenanceValid()` | SYNTHETIC / uncited records excluded from the valid count |
| **quality-score** | `qualityScore()` | deterministic, explainable per-record score |
| **index** | inverted index + Okapi BM25 (`corpus-index.ts`) | selective term→postings retrieval (not a full scan) |
| **retrieve** | BM25 / TF-IDF cosine / graph / hybrid fusion | every hit carries its **citation + source authority** (not neural) |
| **export** | `exportCorpusManifest()` (`corpus-export.ts`) | order-independent deterministic manifest hash + per-record digests |
| **verify** | `verifyManifest()` | detects MISSING / EXTRA / CONTENT_HASH_DRIFT / METADATA_CHANGED |
| **durability** | `corpusPersistenceProof()` (`corpus-health.ts`) | live-pg write→read→verify→delete round-trip proof |

Retrieval endpoints (all clearance-enforced): `iuc.corpusStatus`,
`iuc.corpusSearch`, `iuc.corpusHybridSearch`, `iuc.corpusQualityAudit`,
`iuc.corpusManifest`, `iuc.corpusPersistenceProof`.

## 2. Ingesting a licensed / open source

Point `CORPUS_SEED_FILE` at any provenance-bearing JSON dataset and run the
seed. Records are ingested as `INGESTED`, **cited to the dataset file**, and run
through the full dedupe + quality + persistence pipeline.

```bash
# durable persistence requires a postgres:// (or mysql://) DATABASE_URL
export DATABASE_URL="postgres://…"          # production is postgres (Render secret)
export CORPUS_SEED_FILE="./data/vet-knowledge.json"
npm run seed:corpus
```

Accepted shapes:

- a top-level JSON **array**, or
- an object with a records array under any of:
  `records` | `items` | `data` | `entries` | `knowledge`.

Per-record field mapping (all optional except text):

| Corpus field | Source keys tried (first non-empty wins) |
|--------------|------------------------------------------|
| content text | `title` · `name` · `topic` · `content` · `summary` · `description` · `text` · `body` · `note` · `notes` (joined) |
| trust | `confidence` · `trust` (clamped 0–1, default 0.7) |
| sources | `sources` (default 2) |
| provenance | `INGESTED`, citation = dataset path, authority = "external dataset" |

The run prints a **measured** summary (`measured_corpus_count`,
`provenance_valid`, `authored` / `ingested` / `synthetic`, avg quality). The
reported numbers are the REAL persisted counts.

> Provenance integrity: prefer datasets that carry a per-record source/citation
> field. If a source lacks record-level citation, ingest it under a single
> dataset-level citation and treat those records as INGESTED (not AUTHORED).

## 3. Candidate CC0 / public-domain sources (need founder authorisation)

Listed license-first. **CC0 / US-Gov public-domain are fully compatible**;
share-alike sources carry obligations and are flagged.

| Source | License | Link | Notes |
|--------|---------|------|-------|
| **Wikidata** — veterinary / animal-disease / drug entities | **CC0** | https://www.wikidata.org/ · SPARQL: https://query.wikidata.org/ | Fully compatible (public-domain dedication). Entity labels + descriptions are short → best as structured canonical facts, not long-form knowledge. |
| **openFDA — Animal & Veterinary** | **US-Gov public domain** | https://open.fda.gov/apis/animalandveterinary/ · endpoint: https://api.fda.gov/animalandveterinary/event.json | Authoritative (FDA/CVM). Adverse-event + animal-drug data; structured event records (treat as derived/structured, not narrative knowledge). |
| Wikipedia / WikiVet — veterinary category | CC BY-SA 4.0 | https://en.wikipedia.org/wiki/Category:Veterinary_medicine | Attribution **and** share-alike obligations. Usable but adds licensing constraints on redistribution. |
| PubMed — veterinary abstracts | metadata public; article text publisher-copyright | https://www.ncbi.nlm.nih.gov/pmc/tools/developers/ (E-utilities) | Only titles/abstracts where the abstract is openly licensed; full text is often copyrighted. |

### Exact activation step (per source)

1. Founder authorises ONE source above (or supplies a licensed dataset).
2. Fetch it into a JSON file in the accepted shape, one record per knowledge
   statement, with a per-record `source`/`citation` where the license requires
   attribution.
3. `export CORPUS_SEED_FILE=<file>` and `npm run seed:corpus` against the
   production `postgres://` `DATABASE_URL`.
4. Verify with `iuc.corpusStatus` (measured count) and `iuc.corpusManifest`
   (verifiable manifest) — the count must be the real persisted number.

## 4. Honesty constraints (§7)

- **No record-count inflation.** Duplicates (content-hash) and SYNTHETIC/uncited
  records are never counted as canonical.
- **No data generation to hit the floor.** The 25,000 floor is crossed only by
  ingesting real, provenance-valid records from an authorised source.
- **Measured, not asserted.** All reported counts come from the live pipeline
  summary / endpoints, not hard-coded claims.
