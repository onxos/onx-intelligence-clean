// ============================================================
// SKILLS ROUTER — Day 7: 50 NEW Specialized Skills
// 5 Categories × 10 Skills = Industry-grade AI capabilities
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

// --- Skill Definition ---
interface SkillDef {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  description: string;
  systemPrompt: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  exampleInput: string | string[];
  exampleOutput: string;
}

// --- 50 Skills: 5 Categories × 10 ---
const SKILLS: SkillDef[] = [
  // === MARKETING (10) ===
  { id: "mkt_01", name: "SEO Optimization", nameAr: "تحسين محركات البحث", category: "marketing", description: "Analyze and optimize content for search engines", systemPrompt: "You are an SEO expert. Analyze the given content and provide: keyword recommendations, meta title, meta description, heading structure, internal linking suggestions, and readability score. Respond in Arabic.", parameters: [{ name: "content", type: "string", required: true, description: "Content to optimize" }, { name: "targetKeywords", type: "string[]", required: false, description: "Target keywords" }], exampleInput: "Blog post about Islamic finance", exampleOutput: "Keywords: islamic finance, sharia banking... Meta: title 60 chars, description 160 chars..." },
  { id: "mkt_02", name: "SEM Campaign Builder", nameAr: "بناء حملات SEM", category: "marketing", description: "Build search engine marketing campaigns", systemPrompt: "You are a Google Ads specialist. Create a complete SEM campaign with ad groups, keywords (broad, phrase, exact match), ad copy variations, bidding strategy, and landing page recommendations. Arabic + English bilingual.", parameters: [{ name: "product", type: "string", required: true, description: "Product/service to advertise" }, { name: "budget", type: "number", required: false, description: "Monthly budget in USD" }], exampleInput: "ONX Intelligence Platform", exampleOutput: "Campaign: ONX-Brand, 3 ad groups, 15 keywords, $500/day budget..." },
  { id: "mkt_03", name: "Social Media Strategy", nameAr: "استراتيجية التواصل", category: "marketing", description: "Create social media content calendars and strategies", systemPrompt: "You are a social media strategist. Create a 30-day content calendar with post ideas, optimal posting times, hashtag strategies, and engagement tactics for the given platform and audience. Arabic-focused.", parameters: [{ name: "platform", type: "string", required: true, description: "Social platform (Twitter/X, LinkedIn, Instagram, TikTok)" }, { name: "audience", type: "string", required: true, description: "Target audience description" }], exampleInput: "LinkedIn, AI developers in MENA", exampleOutput: "30 posts: 10 educational, 10 thought leadership, 10 engagement..." },
  { id: "mkt_04", name: "Email Marketing", nameAr: "التسويق بالبريد", category: "marketing", description: "Design email campaigns with templates and automation", systemPrompt: "You are an email marketing expert. Write a complete email sequence (subject line, preview text, body, CTA) with A/B testing variations and automation triggers. Arabic-optimized.", parameters: [{ name: "campaignType", type: "string", required: true, description: "Type: welcome, nurture, promotional, re-engagement" }, { name: "product", type: "string", required: true, description: "Product or service" }], exampleInput: "Welcome series for ONX platform", exampleOutput: "5-email sequence: Day 0 (welcome), Day 2 (features), Day 5 (case study)..." },
  { id: "mkt_05", name: "Content Strategy", nameAr: "استراتيجية المحتوى", category: "marketing", description: "Develop comprehensive content strategies", systemPrompt: "You are a content strategist. Create a content strategy with pillar pages, topic clusters, content formats, distribution channels, and KPIs. Include editorial calendar for 3 months. Bilingual Arabic/English.", parameters: [{ name: "business", type: "string", required: true, description: "Business description" }, { name: "goals", type: "string", required: false, description: "Marketing goals" }], exampleInput: "ONX: Islamic AI platform", exampleOutput: "3 pillars: Constitutional AI, Titan Bridge, Knowledge Sovereignty..." },
  { id: "mkt_06", name: "Brand Identity", nameAr: "هوية العلامة", category: "marketing", description: "Develop brand voice, visual guidelines, and positioning", systemPrompt: "You are a brand strategist. Create brand guidelines including: mission/vision, brand voice (formal/informal/tone), color psychology, typography recommendations, tagline options, and competitive positioning. Arabic-first.", parameters: [{ name: "company", type: "string", required: true, description: "Company name and description" }, { name: "industry", type: "string", required: true, description: "Industry" }], exampleInput: "ONX Intelligence", exampleOutput: "Mission: Build civilization-scale AI... Voice: Authoritative yet compassionate..." },
  { id: "mkt_07", name: "Marketing Analytics", nameAr: "تحليل التسويق", category: "marketing", description: "Analyze marketing metrics and provide insights", systemPrompt: "You are a marketing analyst. Analyze the provided metrics (CTR, conversion rate, CPA, ROI) and provide actionable insights, trend analysis, and optimization recommendations. Include dashboard recommendations.", parameters: [{ name: "metrics", type: "object", required: true, description: "Marketing metrics JSON" }, { name: "period", type: "string", required: false, description: "Analysis period" }], exampleInput: "{ctr: 2.5%, conversion: 3.2%, cpa: $45}", exampleOutput: "CTR above industry avg (2.1%)... Conversion opportunity: optimize landing page..." },
  { id: "mkt_08", name: "Growth Hacking", nameAr: "نمو سريع", category: "marketing", description: "Design growth experiments and viral loops", systemPrompt: "You are a growth hacker. Design 5 growth experiments with hypothesis, methodology, success metrics, and expected impact. Focus on low-cost, high-impact tactics. Arabic market context.", parameters: [{ name: "product", type: "string", required: true, description: "Product to grow" }, { name: "currentUsers", type: "number", required: false, description: "Current user count" }], exampleInput: "ONX Titan Bridge", exampleOutput: "Experiment 1: Referral loop with GPT credits... Experiment 2: Community challenges..." },
  { id: "mkt_09", name: "Influencer Marketing", nameAr: "التسويق بالمؤثرين", category: "marketing", description: "Plan influencer campaigns with ROI tracking", systemPrompt: "You are an influencer marketing manager. Create a campaign plan: influencer tier strategy (nano/micro/macro), content brief, compensation model, KPIs, and authenticity guidelines. MENA market focus.", parameters: [{ name: "product", type: "string", required: true, description: "Product to promote" }, { name: "budget", type: "number", required: true, description: "Campaign budget" }], exampleInput: "ONX Intelligence", exampleOutput: "Tier 1: 5 nano influencers ($500 each)... Tier 2: 2 micro ($2000 each)..." },
  { id: "mkt_10", name: "Affiliate Program", nameAr: "برنامج التسويق بالعمولة", category: "marketing", description: "Design affiliate programs with commission structures", systemPrompt: "You are an affiliate program manager. Design a complete affiliate program: commission tiers, cookie duration, promotional materials, tracking system, and payout structure. Sharia-compliant options.", parameters: [{ name: "product", type: "string", required: true, description: "Product" }, { name: "price", type: "number", required: true, description: "Product price" }], exampleInput: "ONX Enterprise: $500/month", exampleOutput: "Tier 1: 10% recurring... Tier 2: 15% after 10 sales... Cookie: 90 days..." },

  // === CONTENT (10) ===
  { id: "cnt_01", name: "Copywriting", nameAr: "الكتابة الإعلانية", category: "content", description: "Write persuasive copy for ads, landing pages, and sales", systemPrompt: "You are a master copywriter. Write compelling copy using AIDA framework (Attention, Interest, Desire, Action). Include headline variations, body copy, and CTAs. Arabic + English.", parameters: [{ name: "product", type: "string", required: true, description: "Product/service" }, { name: "audience", type: "string", required: true, description: "Target audience" }], exampleInput: "ONX Intelligence Platform, CTOs in MENA", exampleOutput: "Headline: Finally, AI That Understands Your Values... Body: [AIDA structure]..." },
  { id: "cnt_02", name: "Video Scripting", nameAr: "كتابة سيناريو الفيديو", category: "content", description: "Write scripts for explainer, tutorial, and promotional videos", systemPrompt: "You are a video scriptwriter. Write a complete video script with: hook (first 5 seconds), problem statement, solution reveal, social proof, and call-to-action. Include visual directions and timing. Arabic-focused.", parameters: [{ name: "topic", type: "string", required: true, description: "Video topic" }, { name: "duration", type: "number", required: false, description: "Target duration in seconds" }], exampleInput: "ONX Titan Bridge introduction", exampleOutput: "[0-5s] Hook: What if you had 5 AI experts... [5-15s] Problem: Most AI is one-dimensional..." },
  { id: "cnt_03", name: "Podcast Production", nameAr: "إنتاج البودكاست", category: "content", description: "Plan podcast episodes with structure and questions", systemPrompt: "You are a podcast producer. Create a complete episode plan: title, description, guest questions (10), segment breakdown, intro/outro scripts, and promotion snippets. Arabic or bilingual.", parameters: [{ name: "topic", type: "string", required: true, description: "Episode topic" }, { name: "guest", type: "string", required: false, description: "Guest name and expertise" }], exampleInput: "Constitutional AI with Dr. Ahmed", exampleOutput: "Title: Building Trustworthy AI... Questions: 1. What is Constitutional AI? 2. How..." },
  { id: "cnt_04", name: "Design Brief", nameAr: "مذكرة تصميم", category: "content", description: "Create detailed graphic design briefs", systemPrompt: "You are a creative director. Write a comprehensive design brief: objective, target audience, mood board descriptions, color palette suggestions, typography, deliverables, and brand alignment notes. Arabic context.", parameters: [{ name: "project", type: "string", required: true, description: "Design project description" }, { name: "style", type: "string", required: false, description: "Preferred style" }], exampleInput: "ONX Intelligence brand identity", exampleOutput: "Objective: Convey trust + innovation... Colors: Deep blue (trust), Gold (excellence)..." },
  { id: "cnt_05", name: "Translation", nameAr: "الترجمة", category: "content", description: "Professional Arabic-English translation with context", systemPrompt: "You are a professional translator specializing in Arabic-English technical translation. Translate the given text preserving: technical accuracy, cultural context, tone, and register. Note any untranslatable terms.", parameters: [{ name: "text", type: "string", required: true, description: "Text to translate" }, { name: "direction", type: "string", required: true, description: "ar-en or en-ar" }], exampleInput: "Constitutional AI governance framework", exampleOutput: "إطار حوكمة الذكاء الاصطناعي الدستوري... Notes: 'Constitutional AI' → 'الذكاء الاصطناعي الدستوري'..." },
  { id: "cnt_06", name: "Transcription", nameAr: "النسخ", category: "content", description: "Convert audio/video to text with formatting", systemPrompt: "You are a transcription specialist. Convert the provided audio content to clean, formatted text with: speaker labels, timestamps, paragraph breaks, and [inaudible] markers. Arabic diacritics preserved.", parameters: [{ name: "audio", type: "string", required: true, description: "Audio content or URL" }, { name: "speakers", type: "number", required: false, description: "Number of speakers" }], exampleInput: "Arabic podcast about AI ethics", exampleOutput: "[00:00] المضيف: مرحباً بكم... [00:15] الضيف: شكراً على الاستضافة..." },
  { id: "cnt_07", name: "Summarization", nameAr: "التلخيص", category: "content", description: "Summarize long documents with key points extraction", systemPrompt: "You are a summarization expert. Create three versions: 1-sentence summary, 1-paragraph summary, and bullet-point key takeaways. Preserve all critical data points and conclusions. Arabic or English.", parameters: [{ name: "document", type: "string", required: true, description: "Document to summarize" }, { name: "focus", type: "string", required: false, description: "Focus area" }], exampleInput: "10-page report on ONX architecture", exampleOutput: "1-sentence: ONX is a 6-layer... Bullets: 18 engines, 120 endpoints..." },
  { id: "cnt_08", name: "Fact-checking", nameAr: "تدقيق الحقائق", category: "content", description: "Verify claims against known sources", systemPrompt: "You are a fact-checker. Analyze the given claims and rate each: VERIFIED, PARTIALLY TRUE, MISLEADING, or FALSE. Provide evidence and source reliability assessment. Be conservative in verification.", parameters: [{ name: "claims", type: "string[]", required: true, description: "Claims to verify" }], exampleInput: ["ONX has 18 engines", "GPT-4o can process Arabic"], exampleOutput: "Claim 1: VERIFIED (source: code inspection)... Claim 2: VERIFIED (OpenAI docs)..." },
  { id: "cnt_09", name: "Content Curation", nameAr: "البحث والتقصي", category: "content", description: "Curate relevant content from multiple sources", systemPrompt: "You are a content curator. Find and organize relevant content on the given topic: articles, research papers, videos, podcasts. Rate each source for reliability and relevance. Include brief summaries.", parameters: [{ name: "topic", type: "string", required: true, description: "Topic to research" }, { name: "format", type: "string", required: false, description: "Preferred formats" }], exampleInput: "Constitutional AI 2024", exampleOutput: "5 articles, 2 papers, 3 videos... Top: Anthropic research (reliability: 95%)..." },
  { id: "cnt_10", name: "Publishing", nameAr: "النشر", category: "content", description: "Format content for multi-platform publishing", systemPrompt: "You are a publishing specialist. Reformat the given content for: blog post (with SEO), LinkedIn post, Twitter/X thread, and email newsletter. Each optimized for the platform's best practices. Arabic + English.", parameters: [{ name: "content", type: "string", required: true, description: "Original content" }, { name: "platforms", type: "string[]", required: false, description: "Target platforms" }], exampleInput: "ONX Day 6 update", exampleOutput: "Blog: 800 words with headings... LinkedIn: 300 words + hashtags... Twitter: 5-tweet thread..." },

  // === INTELLIGENCE (10) ===
  { id: "int_01", name: "Market Research", nameAr: "بحث السوق", category: "intelligence", description: "Conduct market analysis with competitor profiles", systemPrompt: "You are a market research analyst. Provide: market size, growth rate, key players, trends, opportunities, and threats. Include Porter's Five Forces analysis. MENA focus where relevant.", parameters: [{ name: "market", type: "string", required: true, description: "Market to analyze" }, { name: "region", type: "string", required: false, description: "Geographic focus" }], exampleInput: "Islamic AI platforms in MENA", exampleOutput: "TAM: $2B... CAGR: 35%... Key players: ONX, Raffles, Qalb..." },
  { id: "int_02", name: "Competitive Analysis", nameAr: "تحليل المنافسة", category: "intelligence", description: "Deep-dive competitor analysis with positioning maps", systemPrompt: "You are a competitive intelligence analyst. Create a competitor profile: strengths, weaknesses, pricing, features, market share, and positioning. Include SWOT and perceptual map.", parameters: [{ name: "competitor", type: "string", required: true, description: "Competitor name" }, { name: "product", type: "string", required: true, description: "Your product" }], exampleInput: "Salesforce Agentforce vs ONX", exampleOutput: "Strengths: Large ecosystem... Weaknesses: No constitutional framework..." },
  { id: "int_03", name: "Trend Forecasting", nameAr: "التنبؤ بالاتجاهات", category: "intelligence", description: "Predict industry trends with confidence intervals", systemPrompt: "You are a trend forecaster. Analyze current signals and predict 1-year, 3-year, and 5-year trends. Include: probability, impact, catalysts, and early indicators. Technology industry focus.", parameters: [{ name: "industry", type: "string", required: true, description: "Industry to forecast" }, { name: "timeframe", type: "string", required: false, description: "Forecast horizon" }], exampleInput: "AI in Islamic finance", exampleOutput: "1yr: AI-powered fatwa (80%)... 3yr: Autonomous sharia compliance (60%)... 5yr: AI mufti (30%)..." },
  { id: "int_04", name: "Sentiment Analysis", nameAr: "تحليل المشاعر", category: "intelligence", description: "Analyze text sentiment with emotion detection", systemPrompt: "You are a sentiment analyst. Analyze the text for: overall sentiment (positive/negative/neutral), emotion breakdown (joy, anger, fear, sadness, trust), intensity score, and key phrases driving sentiment. Arabic NLP.", parameters: [{ name: "text", type: "string", required: true, description: "Text to analyze" }], exampleInput: "Customers love ONX but want faster responses", exampleOutput: "Overall: Positive (72%)... Emotions: Joy 40%, Trust 35%... Key: 'love' (+), 'faster' (-)..." },
  { id: "int_05", name: "Risk Assessment", nameAr: "تقييم المخاطر", category: "intelligence", description: "Identify and quantify risks with mitigation strategies", systemPrompt: "You are a risk analyst. Identify: strategic, operational, financial, and compliance risks. Rate each: probability (1-5), impact (1-5), and risk score. Provide mitigation strategies with cost estimates.", parameters: [{ name: "project", type: "string", required: true, description: "Project to assess" }, { name: "context", type: "string", required: false, description: "Additional context" }], exampleInput: "ONX Titan Bridge launch", exampleOutput: "Risk 1: API rate limits (P:3 I:4 Score:12)... Mitigation: caching ($500/month)..." },
  { id: "int_06", name: "Due Diligence", nameAr: "العناية المهنية", category: "intelligence", description: "Conduct investment due diligence reports", systemPrompt: "You are a due diligence analyst. Create a DD report: company overview, financial health, team assessment, technology evaluation, market position, legal compliance, and investment recommendation. Sharia compliance check included.", parameters: [{ name: "company", type: "string", required: true, description: "Company to evaluate" }, { name: "investmentType", type: "string", required: false, description: "Type of investment" }], exampleInput: "Tech startup in halal fintech", exampleOutput: "Overview: 2 years, $1M revenue... Sharia: Compliant (no riba)... Recommendation: Proceed with conditions..." },
  { id: "int_07", name: "OSINT Gathering", nameAr: "الاستخبارات المفتوحة", category: "intelligence", description: "Gather open-source intelligence on targets", systemPrompt: "You are an OSINT specialist. Outline the intelligence gathering plan: sources (social media, public records, news), tools, methodology, and analysis framework. Note legal and ethical boundaries. Arabic sources prioritized.", parameters: [{ name: "target", type: "string", required: true, description: "Intelligence target" }, { name: "scope", type: "string", required: false, description: "Scope of investigation" }], exampleInput: "Competitor product launch patterns", exampleOutput: "Sources: LinkedIn (team changes), GitHub (code activity), Patents... Methodology: Weekly monitoring..." },
  { id: "int_08", name: "Data Analysis", nameAr: "تحليل البيانات", category: "intelligence", description: "Analyze datasets with statistical methods", systemPrompt: "You are a data analyst. Analyze the provided dataset: descriptive statistics, correlations, trends, anomalies, and visualizations. Include actionable insights and hypothesis testing. Clean data recommendations.", parameters: [{ name: "dataset", type: "string", required: true, description: "Dataset or data description" }, { name: "questions", type: "string[]", required: false, description: "Questions to answer" }], exampleInput: "Monthly ONX API usage data", exampleOutput: "Mean: 10K calls/day... Trend: +15% MoM... Anomaly: Day 15 spike (investigate)..." },
  { id: "int_09", name: "Report Generation", nameAr: "إنشاء التقارير", category: "intelligence", description: "Generate professional reports with executive summaries", systemPrompt: "You are a report writer. Create a professional report: executive summary, methodology, findings (with evidence), analysis, recommendations, and appendices. Include charts descriptions. Arabic + English.", parameters: [{ name: "topic", type: "string", required: true, description: "Report topic" }, { name: "audience", type: "string", required: false, description: "Target audience" }], exampleInput: "ONX Platform Performance Q2 2026", exampleOutput: "Executive Summary: 99.9% uptime... Findings: 3 optimizations identified... Recommendations: [5 items]..." },
  { id: "int_10", name: "Briefing", nameAr: "إعداد الموجزات", category: "intelligence", description: "Create executive briefings with key intelligence", systemPrompt: "You are an intelligence briefer. Create a concise briefing: situation overview, key developments, threat assessment, opportunity analysis, and recommended actions. Max 1 page. Top-secret style formatting.", parameters: [{ name: "subject", type: "string", required: true, description: "Briefing subject" }, { name: "urgency", type: "string", required: false, description: "Urgency level" }], exampleInput: "AI competitor moves this week", exampleOutput: "SITUATION: 3 competitors released features... THREAT: Medium... ACTION: Accelerate Day 8 features..." },

  // === CLOUD (10) ===
  { id: "cld_01", name: "AWS Architecture", nameAr: "بنية AWS", category: "cloud", description: "Design AWS infrastructure with cost estimates", systemPrompt: "You are an AWS Solutions Architect. Design infrastructure: VPC, subnets, EC2/ECS, RDS, S3, CloudFront, Route 53. Include architecture diagram (ASCII), cost estimate, and security groups. Sovereign deployment options.", parameters: [{ name: "application", type: "string", required: true, description: "Application description" }, { name: "traffic", type: "string", required: false, description: "Expected traffic" }], exampleInput: "ONX Intelligence Platform", exampleOutput: "VPC: 3 AZs... ECS Fargate: 4 tasks... RDS MySQL: Multi-AZ... Cost: ~$800/month..." },
  { id: "cld_02", name: "GCP Setup", nameAr: "إعداد GCP", category: "cloud", description: "Configure Google Cloud Platform services", systemPrompt: "You are a GCP engineer. Setup: project structure, IAM, Cloud Run, Cloud SQL, Cloud Storage, Load Balancer. Include gcloud commands and Terraform snippets. Cost optimization tips.", parameters: [{ name: "project", type: "string", required: true, description: "Project name" }, { name: "region", type: "string", required: false, description: "Preferred region" }], exampleInput: "ONX Platform", exampleOutput: "gcloud projects create onx-platform... Cloud Run: 2 services... SQL: PostgreSQL..." },
  { id: "cld_03", name: "Azure Config", nameAr: "إعداد Azure", category: "cloud", description: "Configure Microsoft Azure services", systemPrompt: "You are an Azure architect. Design: Resource Group, App Service, Azure SQL, Blob Storage, Application Insights, Key Vault. Include ARM templates and Bicep examples. Hybrid cloud options.", parameters: [{ name: "workload", type: "string", required: true, description: "Workload description" }, { name: "region", type: "string", required: false, description: "Azure region" }], exampleInput: "ONX Enterprise", exampleOutput: "RG: onx-prod-rg... App Service: P2v3... SQL: S2 tier... Cost: ~$600/month..." },
  { id: "cld_04", name: "Kubernetes", nameAr: "كوبرنيتيز", category: "cloud", description: "Design K8s clusters with manifests", systemPrompt: "You are a Kubernetes expert. Create: namespace, deployment, service, ingress, configmap, secret, HPA manifests. Include kubectl commands and helm chart structure. Security best practices.", parameters: [{ name: "app", type: "string", required: true, description: "Application to deploy" }, { name: "replicas", type: "number", required: false, description: "Replica count" }], exampleInput: "ONX API server", exampleOutput: "Deployment: 3 replicas... Service: ClusterIP... Ingress: nginx... HPA: 3-10 replicas..." },
  { id: "cld_05", name: "Docker", nameAr: "دوكر", category: "cloud", description: "Create optimized Dockerfiles and compose files", systemPrompt: "You are a Docker specialist. Write: multi-stage Dockerfile, docker-compose.yml, .dockerignore, and build scripts. Optimize for size and security. Include health checks and non-root user.", parameters: [{ name: "app", type: "string", required: true, description: "Application to containerize" }, { name: "runtime", type: "string", required: false, description: "Runtime (node, python, go)" }], exampleInput: "ONX TypeScript API", exampleOutput: "FROM node:20-alpine AS builder... COPY --from=builder /app/dist... Health: /api/health..." },
  { id: "cld_06", name: "CI/CD Pipeline", nameAr: "خط أنابيب CI/CD", category: "cloud", description: "Build GitHub Actions / GitLab CI pipelines", systemPrompt: "You are a DevOps engineer. Create CI/CD pipeline: lint, test, build, security scan, deploy stages. Include GitHub Actions YAML with matrix builds, caching, and secrets management. Arabic comments.", parameters: [{ name: "project", type: "string", required: true, description: "Project name" }, { name: "platform", type: "string", required: false, description: "CI platform" }], exampleInput: "ONX Atlas Platform", exampleOutput: "on: push branches: [main]... Jobs: lint, test, build, deploy... Secrets: OPENAI_KEY..." },
  { id: "cld_07", name: "Monitoring", nameAr: "المراقبة", category: "cloud", description: "Setup monitoring with Prometheus, Grafana, alerts", systemPrompt: "You are an SRE. Design monitoring: metrics collection, dashboards, alerting rules, SLOs/SLIs, incident response. Include Prometheus queries and Grafana dashboard JSON structure.", parameters: [{ name: "system", type: "string", required: true, description: "System to monitor" }, { name: "slos", type: "string", required: false, description: "SLO targets" }], exampleInput: "ONX API Gateway", exampleOutput: "SLI: 99.9% availability... Metrics: latency_p99, error_rate... Alerts: P99>500ms..." },
  { id: "cld_08", name: "Security Hardening", nameAr: "تصليح الأمان", category: "cloud", description: "Harden infrastructure with security best practices", systemPrompt: "You are a security engineer. Provide hardening checklist: network security, IAM policies, secrets management, encryption, vulnerability scanning, compliance (ISO 27001, SOC 2). CIS benchmarks.", parameters: [{ name: "infrastructure", type: "string", required: true, description: "Infrastructure to harden" }, { name: "compliance", type: "string", required: false, description: "Compliance framework" }], exampleInput: "ONX Kubernetes cluster", exampleOutput: "Network: Calico policies... IAM: RBAC least privilege... Secrets: Vault... Scan: Trivy..." },
  { id: "cld_09", name: "Cost Optimization", nameAr: "تحسين التكلفة", category: "cloud", description: "Optimize cloud costs with right-sizing and reserved instances", systemPrompt: "You are a FinOps engineer. Analyze cloud spend and recommend: right-sizing, reserved instances, spot instances, savings plans, auto-scaling, and waste elimination. Include cost projection.", parameters: [{ name: "currentSpend", type: "number", required: true, description: "Monthly spend in USD" }, { name: "provider", type: "string", required: true, description: "Cloud provider" }], exampleInput: "$5000/month AWS", exampleOutput: "EC2: Switch to Graviton (-20%)... RDS: Reserved 1yr (-40%)... Waste: 3 unattached EBS ($200)..." },
  { id: "cld_10", name: "Disaster Recovery", nameAr: "التعافي من الكوارث", category: "cloud", description: "Design DR strategies with RTO/RPO targets", systemPrompt: "You are a DR architect. Design disaster recovery: backup strategy, replication, failover procedures, RTO/RPO definitions, runbooks, and testing schedule. Include DR site architecture.", parameters: [{ name: "system", type: "string", required: true, description: "System to protect" }, { name: "rto", type: "string", required: false, description: "RTO target" }], exampleInput: "ONX Database + API", exampleOutput: "RTO: 1 hour, RPO: 15 minutes... Backup: hourly snapshots... DR: cross-region replica..." },

  // === PERSONAL (10) ===
  { id: "per_01", name: "Time Management", nameAr: "إدارة الوقت", category: "personal", description: "Optimize schedules with priority frameworks", systemPrompt: "You are a productivity coach. Analyze the schedule and apply: Eisenhower Matrix, time blocking, Pomodoro technique, and energy management. Create an optimized daily/weekly schedule. Arabic context.", parameters: [{ name: "tasks", type: "string[]", required: true, description: "List of tasks" }, { name: "constraints", type: "string", required: false, description: "Time constraints" }], exampleInput: ["ONX Day 7 planning", "Team meeting", "Code review", "Documentation"], exampleOutput: "Urgent/Important: Planning (8-10am)... Important: Code review (10:30-12pm)... Delegate: Documentation..." },
  { id: "per_02", name: "Learning Path", nameAr: "مسار التعلم", category: "personal", description: "Create personalized learning paths with milestones", systemPrompt: "You are a learning designer. Create a learning path: prerequisites, resources, milestones, practice projects, and assessment criteria. Include free and paid resources. Arabic resources prioritized.", parameters: [{ name: "topic", type: "string", required: true, description: "Topic to learn" }, { name: "level", type: "string", required: false, description: "Current level" }], exampleInput: "TypeScript advanced patterns", exampleOutput: "Week 1: Generics deep dive... Week 2: Type guards... Project: Build type-safe API client..." },
  { id: "per_03", name: "Habit Tracking", nameAr: "تتبع العادات", category: "personal", description: "Design habit formation systems with streaks", systemPrompt: "You are a behavioral psychologist. Design a habit tracking system: cue-routine-reward loops, implementation intentions, accountability mechanisms, and progress visualization. Islamic habits integration.", parameters: [{ name: "habit", type: "string", required: true, description: "Habit to build" }, { name: "frequency", type: "string", required: false, description: "Target frequency" }], exampleInput: "Daily Quran reading", exampleOutput: "Cue: After Fajr prayer... Routine: Read 2 pages... Reward: Track in app... Streak goal: 30 days..." },
  { id: "per_04", name: "Goal Setting", nameAr: "تحديد الأهداف", category: "personal", description: "Set SMART goals with OKR alignment", systemPrompt: "You are a goal-setting expert. Transform vague goals into SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound). Align with OKR framework. Include milestones and KPIs.", parameters: [{ name: "goal", type: "string", required: true, description: "Goal to structure" }, { name: "deadline", type: "string", required: false, description: "Target deadline" }], exampleInput: "Build ONX to 1000 users", exampleOutput: "SMART: Acquire 1000 active users by Dec 2026... KRs: 300 users/month... Milestones: 250 by Sep..." },
  { id: "per_05", name: "Decision Making", nameAr: "اتخاذ القرار", category: "personal", description: "Apply decision frameworks with risk analysis", systemPrompt: "You are a decision strategist. Apply: decision matrix, pros/cons analysis, expected value calculation, and pre-mortem analysis. Include decision journal format for tracking outcomes.", parameters: [{ name: "decision", type: "string", required: true, description: "Decision to make" }, { name: "options", type: "string[]", required: true, description: "Available options" }], exampleInput: "Which AI provider to prioritize?", exampleOutput: "Option A (OpenAI): Score 85... Option B (Claude): Score 78... Recommendation: OpenAI for now, evaluate Claude in Q3..." },
  { id: "per_06", name: "Communication", nameAr: "التواصل", category: "personal", description: "Improve communication with frameworks", systemPrompt: "You are a communication coach. Apply: Nonviolent Communication, SBI feedback model (Situation-Behavior-Impact), active listening techniques, and persuasive communication. Arabic business context.", parameters: [{ name: "scenario", type: "string", required: true, description: "Communication scenario" }, { name: "audience", type: "string", required: false, description: "Target audience" }], exampleInput: "Giving feedback to developer about missed deadline", exampleOutput: "SBI: In the sprint review (S), the feature was not delivered (B), which delays the release (I)... Ask: What support do you need?..." },
  { id: "per_07", name: "Leadership", nameAr: "القيادة", category: "personal", description: "Develop leadership skills with situational frameworks", systemPrompt: "You are a leadership coach. Apply: situational leadership, servant leadership, Islamic leadership principles (shura, amanah), delegation frameworks, and team motivation strategies.", parameters: [{ name: "situation", type: "string", required: true, description: "Leadership situation" }, { name: "teamSize", type: "number", required: false, description: "Team size" }], exampleInput: "Leading remote dev team of 5", exampleOutput: "Style: Delegating (mature team)... Communication: Daily async + weekly sync... Motivation: Autonomy + mastery..." },
  { id: "per_08", name: "Creativity", nameAr: "الإبداع", category: "personal", description: "Apply creative thinking techniques", systemPrompt: "You are a creativity facilitator. Apply: SCAMPER technique, design thinking, lateral thinking, brainstorming frameworks, and mind mapping. Generate 10 creative ideas for the given challenge.", parameters: [{ name: "challenge", type: "string", required: true, description: "Challenge to solve" }, { name: "constraints", type: "string", required: false, description: "Constraints" }], exampleInput: "Make ONX onboarding more engaging", exampleOutput: "1. Titan personality quiz... 2. Interactive constitutional pledge... 3. First conversation with Prometheus... [7 more]" },
  { id: "per_09", name: "Critical Thinking", nameAr: "التفكير النقدي", category: "personal", description: "Apply critical thinking frameworks to problems", systemPrompt: "You are a critical thinking instructor. Apply: first principles thinking, Socratic questioning, logical fallacy detection, Bayesian reasoning, and cognitive bias awareness. Deconstruct the given argument.", parameters: [{ name: "argument", type: "string", required: true, description: "Argument to analyze" }], exampleInput: "We should use only open-source AI models", exampleOutput: "First principles: Why? → Control, cost, transparency... Biases: Availability (open-source hype)... Counter: GPT-4o is more capable for some tasks..." },
  { id: "per_10", name: "Emotional Intelligence", nameAr: "الذكاء العاطفي", category: "personal", description: "Develop EQ with self-awareness techniques", systemPrompt: "You are an EQ coach. Apply: Goleman's EQ framework (self-awareness, self-regulation, motivation, empathy, social skills), journaling prompts, and conflict resolution strategies. Islamic tarbiya integration.", parameters: [{ name: "situation", type: "string", required: true, description: "Emotional situation" }, { name: "role", type: "string", required: false, description: "Your role" }], exampleInput: "Team conflict over technical approach", exampleOutput: "Self-awareness: Recognize your bias... Empathy: Understand their perspective... Regulation: Pause before responding... Action: Facilitate structured discussion..." },
];

// --- Store for skill execution logs ---
const executionLog: Array<{
  timestamp: string;
  skillId: string;
  skillName: string;
  category: string;
  status: string;
}> = [];

export const skillsRouter = createRouter({
  // SK-01: list — All skills
  list: publicQuery
    .input(z.object({
      category: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(({ input }) => {
      let skills = [...SKILLS];
      if (input?.category) skills = skills.filter((s) => s.category === input.category);
      return {
        skills: skills.slice(0, input?.limit || 50).map((s) => ({
          id: s.id,
          name: s.name,
          nameAr: s.nameAr,
          category: s.category,
          description: s.description,
        })),
        total: skills.length,
        categories: [...new Set(SKILLS.map((s) => s.category))],
      };
    }),

  // SK-02: get — Single skill detail
  get: publicQuery
    .input(z.object({ skillId: z.string() }))
    .query(({ input }) => {
      const skill = SKILLS.find((s) => s.id === input.skillId);
      if (!skill) throw new Error("SKILL_NOT_FOUND");
      return skill;
    }),

  // SK-03: categories — List categories with counts
  categories: publicQuery.query(() => {
    const cats: Record<string, { count: number; skills: string[] }> = {};
    for (const s of SKILLS) {
      if (!cats[s.category]) cats[s.category] = { count: 0, skills: [] };
      cats[s.category].count++;
      cats[s.category].skills.push(s.name);
    }
    return {
      categories: Object.entries(cats).map(([name, data]) => ({ name, ...data })),
      total: SKILLS.length,
    };
  }),

  // SK-04: execute — Execute a skill (log + return prompt)
  execute: publicQuery
    .input(z.object({
      skillId: z.string(),
      params: z.record(z.string(), z.string()).default({}),
    }))
    .mutation(({ input }) => {
      const skill = SKILLS.find((s) => s.id === input.skillId);
      if (!skill) throw new Error("SKILL_NOT_FOUND");

      executionLog.push({
        timestamp: new Date().toISOString(),
        skillId: skill.id,
        skillName: skill.name,
        category: skill.category,
        status: "EXECUTED",
      });

      return {
        executed: true,
        skill: {
          id: skill.id,
          name: skill.name,
          nameAr: skill.nameAr,
          category: skill.category,
        },
        systemPrompt: skill.systemPrompt,
        parameters: skill.parameters,
        exampleInput: skill.exampleInput,
        exampleOutput: skill.exampleOutput,
        providedParams: input.params,
        note: "Use this systemPrompt with your Titan (via titan.ask) to execute this skill",
      };
    }),

  // SK-05: search — Find skills by keyword
  search: publicQuery
    .input(z.object({
      query: z.string(),
      limit: z.number().default(10),
    }))
    .query(({ input }) => {
      const queryLower = input.query.toLowerCase();
      const results = SKILLS.filter((s) =>
        s.name.toLowerCase().includes(queryLower) ||
        s.nameAr.includes(queryLower) ||
        s.description.toLowerCase().includes(queryLower) ||
        s.category.toLowerCase().includes(queryLower)
      );
      return {
        query: input.query,
        results: results.slice(0, input.limit).map((s) => ({
          id: s.id,
          name: s.name,
          nameAr: s.nameAr,
          category: s.category,
          description: s.description,
        })),
        count: results.length,
      };
    }),

  // SK-06: stats — Skill usage statistics
  stats: publicQuery.query(() => ({
    totalSkills: SKILLS.length,
    byCategory: {
      marketing: SKILLS.filter((s) => s.category === "marketing").length,
      content: SKILLS.filter((s) => s.category === "content").length,
      intelligence: SKILLS.filter((s) => s.category === "intelligence").length,
      cloud: SKILLS.filter((s) => s.category === "cloud").length,
      personal: SKILLS.filter((s) => s.category === "personal").length,
    },
    totalExecutions: executionLog.length,
    recentExecutions: executionLog.slice(-20),
  })),
});
