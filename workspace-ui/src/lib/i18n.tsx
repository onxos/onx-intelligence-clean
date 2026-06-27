"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

type Locale = "en" | "ar";
type Direction = "ltr" | "rtl";
interface Dict {
  [key: string]: string | Dict;
}

type I18nContextValue = {
  locale: Locale;
  direction: Direction;
  isRtl: boolean;
  setLocale: (next: Locale) => void;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
};

const LOCALE_KEY = "onx_workspace_locale";

const dictionary: Record<Locale, Dict> = {
  en: {
    brand: {
      product: "ONX Intelligence",
      workspace: "Intelligence Workspace",
    },
    nav: {
      home: "Home",
      projects: "Projects",
      intelligence: "Intelligence",
      knowledge: "Knowledge",
      sources: "Sources",
      evidence: "Evidence",
      agents: "Agents",
      models: "Models",
      providers: "Providers",
      tools: "Tools",
      evaluations: "Evaluations",
      memory: "Memory",
      reports: "Reports",
      monitoring: "Monitoring",
      settings: "Settings",
    },
    common: {
      activeDomain: "Active domain",
      contextPanel: "Context Panel",
      executionTimeline: "Execution Timeline",
      live: "Live",
      loading: "Loading...",
      loadingDomain: "Loading {domain}...",
      search: "Search...",
      sortBy: "Sort by {field}",
      sortOrder: "Sort order",
      asc: "Asc",
      desc: "Desc",
      page: "Page {page}",
      previous: "Previous",
      next: "Next",
      new: "New",
      edit: "Edit",
      delete: "Delete",
      clear: "Clear",
      create: "Create",
      update: "Update",
      save: "Save",
      saveSettings: "Save Settings",
      saving: "Saving...",
      signingIn: "Signing in...",
      creatingAccount: "Creating account...",
      signOut: "Sign out",
      signIn: "Sign in",
      register: "Register",
      login: "Login",
      language: "Language",
      required: "{field} is required.",
      recordsCount: "Records ({count})",
      noRecordsForFilters: "No records found for current filters.",
      noRecords: "No records available.",
      actions: "Actions",
      allLabel: "All {label}",
      selectLabel: "Select {label}",
      perPage: "{size} / page",
      deleteConfirm: "Delete this record?",
      workspaceInitialized: "Workspace initialized. Fetching live intelligence domains from production API.",
      noAuthAccount: "No account?",
      alreadyRegistered: "Already registered?",
      authenticatedUser: "Authenticated User",
      viewJson: "JSON View",
      compact: "Compact",
      comfortable: "Comfortable",
      layout: "Layout",
      recentActivity: "Recent Activity",
      recentAssets: "Recent Assets",
      recentSearches: "Recent Searches",
      noRecentActivity: "No recent activity yet.",
      noRecentAssets: "No recent assets yet.",
      noRecentSearches: "No recent searches yet.",
      role: "Role",
      project: "Current Project",
      unknown: "Unknown",
    },
    auth: {
      email: "Email",
      password: "Password",
      name: "Name",
      loginTitle: "Login",
      registerTitle: "Register",
      loginFailed: "Login failed",
      registerFailed: "Register failed",
    },
    workspace: {
      homeTitle: "Workspace Home",
      loadingSnapshot: "Loading workspace snapshot...",
      recentIntelligence: "Recent Intelligence",
      recentEvidence: "Recent Evidence",
      noIntelligence: "No intelligence records yet.",
      noEvidence: "No evidence records yet.",
      intelligence: "Intelligence",
      evidence: "Evidence",
      providers: "Providers",
      tools: "Tools",
    },
    domains: {
      projects: {
        title: "Projects",
        description: "Manage projects with production CRUD, filtering, sorting, and pagination.",
      },
      intelligence: {
        title: "Intelligence Objects",
        description: "Capture and evolve intelligence objects with ownership and confidence metadata.",
        stats: "Intelligence Stats",
        loading: "Loading intelligence session...",
      },
      knowledge: {
        title: "Knowledge Assets",
        description: "Curate workspace knowledge assets with real persistence and governance metadata.",
      },
      sources: {
        title: "Sources",
        description: "Manage provenance/source records for traceable workspace operations.",
      },
      evidence: {
        title: "Evidence",
        description: "Track evidence records with confidence and outcome fields.",
      },
      agents: {
        title: "Agents",
        description: "Create, update, and manage agents with workspace-level controls.",
      },
      models: {
        title: "Models",
        description: "Maintain provider model inventory with live persistence in provider profiles.",
      },
      providers: {
        title: "Providers",
        description: "Manage provider profiles and scoring inputs in production.",
      },
      tools: {
        title: "Tools",
        description: "Manage tools with category/status, capabilities, and cost controls.",
      },
      evaluations: {
        title: "Evaluations",
        description: "Evaluate provider performance with persisted ISES records.",
      },
      memory: {
        title: "Memory",
        description: "Persist operational memory entries with category and tags.",
      },
      reports: {
        title: "Reports Snapshot",
        governance: "Governance Records",
        capital: "Capital Records",
        loading: "Loading reports...",
      },
      monitoring: {
        title: "Monitoring",
        health: "Health Endpoint",
        audit: "Monitoring Audit Feed",
        loading: "Loading monitoring snapshot...",
        noAudit: "No audit entries available.",
      },
      settings: {
        title: "Settings Editor",
        loading: "Loading settings...",
        displayName: "Display Name",
        status: "Status",
      },
      projectDetails: {
        loading: "Loading project...",
        title: "Project Details: {id}",
      },
    },
    fields: {
      id: "ID",
      name: "Name",
      description: "Description",
      status: "Status",
      createdAt: "Created At",
      title: "Title",
      content: "Content",
      category: "Category",
      tags: "Tags",
      model: "Model",
      providerId: "Provider ID",
      providerName: "Provider Name",
      providerStatus: "Provider Status",
      priority: "Priority",
      models: "Models",
      iseScore: "ISE Score",
      action: "Action",
      resource: "Resource",
      resourceId: "Resource ID",
      oldValue: "Old Value",
      newValue: "New Value",
      intent: "Intent",
      confidence: "Confidence",
      judgment: "Judgment",
      outcome: "Outcome",
      learning: "Learning",
      toolId: "Tool ID",
      toolName: "Tool Name",
      capabilities: "Capabilities",
      costPerCall: "Cost Per Call",
      totalCapital: "Total Capital",
      objectType: "Object Type",
      semanticSummary: "Semantic Summary",
      privacyLevel: "Privacy",
      trustScore: "Trust",
      confidenceScore: "Confidence",
      context: "Context",
      actor: "Actor",
    },
    enum: {
      ACTIVE: "Active",
      INACTIVE: "Inactive",
      ARCHIVED: "Archived",
      DISABLED: "Disabled",
      DEPRECATED: "Deprecated",
      EXPERIMENTAL: "Experimental",
      SUSPENDED: "Suspended",
      PAUSED: "Paused",
      PUBLIC: "Public",
      INSTITUTIONAL: "Institutional",
      CONFIDENTIAL: "Confidential",
      RESTRICTED: "Restricted",
      SIGNAL: "Signal",
      PATTERN: "Pattern",
      JUDGMENT: "Judgment",
      UNDERSTANDING: "Understanding",
      WISDOM: "Wisdom",
      EXTERNAL_INTELLIGENCE: "External Intelligence",
      SEARCH: "Search",
      ANALYTICS: "Analytics",
      AUTOMATION: "Automation",
      COMMUNICATION: "Communication",
      KNOWLEDGE: "Knowledge",
      MEDIA: "Media",
      GENERAL: "General",
      INSIGHT: "Insight",
      RISK: "Risk",
      ACTION: "Action",
    },
  },
  ar: {
    brand: {
      product: "اونكس إنتليجنس",
      workspace: "مساحة عمل الذكاء",
    },
    nav: {
      home: "الرئيسية",
      projects: "المشاريع",
      intelligence: "الذكاء",
      knowledge: "المعرفة",
      sources: "المصادر",
      evidence: "الأدلة",
      agents: "الوكلاء",
      models: "النماذج",
      providers: "المزودون",
      tools: "الأدوات",
      evaluations: "التقييمات",
      memory: "الذاكرة",
      reports: "التقارير",
      monitoring: "المراقبة",
      settings: "الإعدادات",
    },
    common: {
      activeDomain: "المجال النشط",
      contextPanel: "لوحة السياق",
      executionTimeline: "الخط الزمني للتنفيذ",
      live: "مباشر",
      loading: "جاري التحميل...",
      loadingDomain: "جاري تحميل {domain}...",
      search: "بحث...",
      sortBy: "ترتيب حسب {field}",
      sortOrder: "اتجاه الترتيب",
      asc: "تصاعدي",
      desc: "تنازلي",
      page: "الصفحة {page}",
      previous: "السابق",
      next: "التالي",
      new: "جديد",
      edit: "تعديل",
      delete: "حذف",
      clear: "مسح",
      create: "إنشاء",
      update: "تحديث",
      save: "حفظ",
      saveSettings: "حفظ الإعدادات",
      saving: "جاري الحفظ...",
      signingIn: "جاري تسجيل الدخول...",
      creatingAccount: "جاري إنشاء الحساب...",
      signOut: "تسجيل الخروج",
      signIn: "تسجيل الدخول",
      register: "إنشاء حساب",
      login: "دخول",
      language: "اللغة",
      required: "حقل {field} مطلوب.",
      recordsCount: "السجلات ({count})",
      noRecordsForFilters: "لا توجد سجلات للمرشحات الحالية.",
      noRecords: "لا توجد سجلات متاحة.",
      actions: "الإجراءات",
      allLabel: "كل {label}",
      selectLabel: "اختر {label}",
      perPage: "{size} / صفحة",
      deleteConfirm: "هل تريد حذف هذا السجل؟",
      workspaceInitialized: "تم تهيئة مساحة العمل. جاري جلب مجالات الذكاء الحية من واجهة الإنتاج.",
      noAuthAccount: "لا تملك حسابًا؟",
      alreadyRegistered: "مسجل بالفعل؟",
      authenticatedUser: "المستخدم الموثق",
      viewJson: "عرض JSON",
      compact: "مضغوط",
      comfortable: "مريح",
      layout: "التخطيط",
      recentActivity: "النشاط الأخير",
      recentAssets: "الأصول الأخيرة",
      recentSearches: "آخر عمليات البحث",
      noRecentActivity: "لا يوجد نشاط حديث بعد.",
      noRecentAssets: "لا توجد أصول حديثة بعد.",
      noRecentSearches: "لا توجد عمليات بحث حديثة بعد.",
      role: "الدور",
      project: "المشروع الحالي",
      unknown: "غير معروف",
    },
    auth: {
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      name: "الاسم",
      loginTitle: "تسجيل الدخول",
      registerTitle: "إنشاء حساب",
      loginFailed: "فشل تسجيل الدخول",
      registerFailed: "فشل التسجيل",
    },
    workspace: {
      homeTitle: "الرئيسية",
      loadingSnapshot: "جاري تحميل ملخص مساحة العمل...",
      recentIntelligence: "الذكاء الأخير",
      recentEvidence: "الأدلة الأخيرة",
      noIntelligence: "لا توجد سجلات ذكاء حتى الآن.",
      noEvidence: "لا توجد سجلات أدلة حتى الآن.",
      intelligence: "الذكاء",
      evidence: "الأدلة",
      providers: "المزودون",
      tools: "الأدوات",
    },
    domains: {
      projects: {
        title: "المشاريع",
        description: "إدارة المشاريع بعمليات CRUD إنتاجية مع التصفية والترتيب والتقسيم.",
      },
      intelligence: {
        title: "عناصر الذكاء",
        description: "التقاط عناصر الذكاء وتطويرها مع ملكية ودرجات الثقة.",
        stats: "إحصاءات الذكاء",
        loading: "جاري تحميل جلسة الذكاء...",
      },
      knowledge: {
        title: "أصول المعرفة",
        description: "تنظيم أصول المعرفة مع حفظ فعلي وبيانات حوكمة.",
      },
      sources: {
        title: "المصادر",
        description: "إدارة سجلات المصدر/التتبع لعمليات قابلة للتدقيق.",
      },
      evidence: {
        title: "الأدلة",
        description: "تتبع سجلات الأدلة مع الثقة والنتائج.",
      },
      agents: {
        title: "الوكلاء",
        description: "إنشاء وتحديث وإدارة الوكلاء بضوابط على مستوى مساحة العمل.",
      },
      models: {
        title: "النماذج",
        description: "إدارة مخزون النماذج لدى المزودين مع حفظ فعلي.",
      },
      providers: {
        title: "المزودون",
        description: "إدارة ملفات المزودين ومدخلات التقييم الإنتاجية.",
      },
      tools: {
        title: "الأدوات",
        description: "إدارة الأدوات مع الفئة/الحالة والقدرات والتحكم بالكلفة.",
      },
      evaluations: {
        title: "التقييمات",
        description: "تقييم أداء المزودين بسجلات ISES محفوظة.",
      },
      memory: {
        title: "الذاكرة",
        description: "حفظ إدخالات الذاكرة التشغيلية مع الفئة والوسوم.",
      },
      reports: {
        title: "ملخص التقارير",
        governance: "سجلات الحوكمة",
        capital: "سجلات رأس المال",
        loading: "جاري تحميل التقارير...",
      },
      monitoring: {
        title: "المراقبة",
        health: "نقطة الصحة",
        audit: "تدفق تدقيق المراقبة",
        loading: "جاري تحميل ملخص المراقبة...",
        noAudit: "لا توجد إدخالات تدقيق متاحة.",
      },
      settings: {
        title: "محرر الإعدادات",
        loading: "جاري تحميل الإعدادات...",
        displayName: "الاسم المعروض",
        status: "الحالة",
      },
      projectDetails: {
        loading: "جاري تحميل المشروع...",
        title: "تفاصيل المشروع: {id}",
      },
    },
    fields: {
      id: "المعرف",
      name: "الاسم",
      description: "الوصف",
      status: "الحالة",
      createdAt: "تاريخ الإنشاء",
      title: "العنوان",
      content: "المحتوى",
      category: "الفئة",
      tags: "الوسوم",
      model: "النموذج",
      providerId: "معرف المزود",
      providerName: "اسم المزود",
      providerStatus: "حالة المزود",
      priority: "الأولوية",
      models: "النماذج",
      iseScore: "درجة ISE",
      action: "الإجراء",
      resource: "المورد",
      resourceId: "معرف المورد",
      oldValue: "القيمة السابقة",
      newValue: "القيمة الجديدة",
      intent: "النية",
      confidence: "الثقة",
      judgment: "الحكم",
      outcome: "النتيجة",
      learning: "التعلم",
      toolId: "معرف الأداة",
      toolName: "اسم الأداة",
      capabilities: "القدرات",
      costPerCall: "الكلفة لكل استدعاء",
      totalCapital: "إجمالي رأس المال",
      objectType: "نوع العنصر",
      semanticSummary: "ملخص دلالي",
      privacyLevel: "الخصوصية",
      trustScore: "الثقة",
      confidenceScore: "درجة الثقة",
      context: "السياق",
      actor: "المنفذ",
    },
    enum: {
      ACTIVE: "نشط",
      INACTIVE: "غير نشط",
      ARCHIVED: "مؤرشف",
      DISABLED: "معطل",
      DEPRECATED: "مهمل",
      EXPERIMENTAL: "تجريبي",
      SUSPENDED: "موقوف",
      PAUSED: "متوقف",
      PUBLIC: "عام",
      INSTITUTIONAL: "مؤسسي",
      CONFIDENTIAL: "سري",
      RESTRICTED: "مقيد",
      SIGNAL: "إشارة",
      PATTERN: "نمط",
      JUDGMENT: "حكم",
      UNDERSTANDING: "فهم",
      WISDOM: "حكمة",
      EXTERNAL_INTELLIGENCE: "ذكاء خارجي",
      SEARCH: "بحث",
      ANALYTICS: "تحليلات",
      AUTOMATION: "أتمتة",
      COMMUNICATION: "اتصال",
      KNOWLEDGE: "معرفة",
      MEDIA: "وسائط",
      GENERAL: "عام",
      INSIGHT: "استبصار",
      RISK: "مخاطر",
      ACTION: "إجراء",
    },
  },
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getNested(dict: Dict, key: string): string | undefined {
  const parts = key.split(".");
  let current: string | Dict | undefined = dict;
  for (const part of parts) {
    if (!current || typeof current === "string") {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(LOCALE_KEY);
  if (saved === "ar" || saved === "en") return saved;
  const browser = window.navigator.language.toLowerCase();
  return browser.startsWith("ar") ? "ar" : "en";
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(detectLocale);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      isRtl: locale === "ar",
      setLocale,
      t: (key, fallback, params) => {
        const lookup = getNested(dictionary[locale], key) ?? getNested(dictionary.en, key);
        const base = lookup ?? fallback ?? key;
        return interpolate(base, params);
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
