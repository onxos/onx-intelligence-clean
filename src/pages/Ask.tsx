// ============================================================
// /ask — Titan Bridge Chat Interface
// Day 3: Interactive UI for 5 AI Titans (GPT-4o)
// ============================================================
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Flame,
  Brain,
  Zap,
  Workflow,
  Shield,
  Users,
  Loader2,
  Bot,
  User,
  Sparkles,
  ChevronRight,
  MessageSquare,
  Clock,
  Hash,
} from "lucide-react";

// --- Titan Definitions ---
interface TitanDef {
  id: string;
  name: string;
  nameAr: string;
  domain: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  description: string;
}

const TITANS: TitanDef[] = [
  {
    id: "prometheus",
    name: "Prometheus",
    nameAr: "بروميثيوس",
    domain: "Strategy & Vision",
    color: "text-amber-600",
    bgColor: "bg-amber-50 hover:bg-amber-100",
    icon: <Flame className="w-5 h-5" />,
    description: "استراتيجية ورؤية",
  },
  {
    id: "athena",
    name: "Athena",
    nameAr: "أثينا",
    domain: "Knowledge & Schema",
    color: "text-blue-600",
    bgColor: "bg-blue-50 hover:bg-blue-100",
    icon: <Brain className="w-5 h-5" />,
    description: "معرفة وهيكل بيانات",
  },
  {
    id: "zeus",
    name: "Zeus",
    nameAr: "زيوس",
    domain: "Architecture",
    color: "text-purple-600",
    bgColor: "bg-purple-50 hover:bg-purple-100",
    icon: <Zap className="w-5 h-5" />,
    description: "بنية تحتية وأنظمة",
  },
  {
    id: "hermes",
    name: "Hermes",
    nameAr: "هيرميس",
    domain: "Operations",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 hover:bg-emerald-100",
    icon: <Workflow className="w-5 h-5" />,
    description: "عمليات وتنفيذ",
  },
  {
    id: "apollo",
    name: "Apollo",
    nameAr: "أبولو",
    domain: "Governance",
    color: "text-red-600",
    bgColor: "bg-red-50 hover:bg-red-100",
    icon: <Shield className="w-5 h-5" />,
    description: "حوكمة وامتثال",
  },
];

// --- Message Type ---
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  titanId?: string;
  titanName?: string;
  tokensUsed?: number;
  latencyMs?: number;
  timestamp: Date;
  isCouncil?: boolean;
}

// --- Generate unique ID ---
function genId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function Ask() {
  // State
  const [selectedTitan, setSelectedTitan] = useState<string>("prometheus");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isCouncilMode, setIsCouncilMode] = useState(false);
  const [sessionMap, setSessionMap] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // tRPC mutations
  const askMutation = trpc.titan.ask.useMutation();
  const councilMutation = trpc.titan.council.useMutation();

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Send message handler
  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: genId(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    if (isCouncilMode) {
      // Council mode: ask all 5 Titans
      try {
        const result = await councilMutation.mutateAsync({
          message: userMessage.content,
        });

        // Add each Titan's response
        result.perspectives.forEach((p) => {
          if (p.status === "SUCCESS") {
            const assistantMsg: ChatMessage = {
              id: genId(),
              role: "assistant",
              content: p.response,
              titanId: p.titan.id,
              titanName: p.titan.nameAr,
              tokensUsed: p.tokensUsed,
              timestamp: new Date(),
              isCouncil: true,
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
        });
      } catch {
        const errorMsg: ChatMessage = {
          id: genId(),
          role: "system",
          content: "⚠️ Council error: Failed to reach the Titans. Please try again.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } else {
      // Single Titan mode
      try {
        const result = await askMutation.mutateAsync({
          titanId: selectedTitan as "prometheus" | "athena" | "zeus" | "hermes" | "apollo",
          message: userMessage.content,
          sessionId: sessionMap[selectedTitan],
        });

        // Save session ID for continuity
        if (result.sessionId) {
          setSessionMap((prev) => ({ ...prev, [selectedTitan]: result.sessionId }));
        }

        const assistantMsg: ChatMessage = {
          id: genId(),
          role: "assistant",
          content: result.response,
          titanId: result.titan.id,
          titanName: result.titan.nameAr,
          tokensUsed: result.tokensUsed,
          latencyMs: result.latencyMs,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: ChatMessage = {
          id: genId(),
          role: "system",
          content: `⚠️ Titan error: Could not reach ${selectedTitan}. Please check your API key and network.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isLoading = askMutation.isPending || councilMutation.isPending;
  const currentTitan = TITANS.find((t) => t.id === selectedTitan) || TITANS[0];

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar — Titan Selector */}
      <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shadow-sm">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h1 className="text-lg font-bold text-gray-900">جسر الأقمار</h1>
          </div>
          <p className="text-xs text-gray-500">Titan Bridge — GPT-4o</p>
        </div>

        {/* Council Mode Toggle */}
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={() => setIsCouncilMode(!isCouncilMode)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isCouncilMode
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>وضع المجلس (5 Titans)</span>
          </button>
        </div>

        {/* Titan List */}
        {!isCouncilMode && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <p className="text-xs font-medium text-gray-400 mb-2 px-1">اختر Titan</p>
            {TITANS.map((titan) => (
              <button
                key={titan.id}
                onClick={() => setSelectedTitan(titan.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-right transition-all ${
                  selectedTitan === titan.id
                    ? `${titan.bgColor} ring-2 ring-offset-1 ring-indigo-300`
                    : "hover:bg-gray-50"
                }`}
              >
                <div className={`p-2 rounded-lg ${titan.bgColor}`}>
                  <span className={titan.color}>{titan.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {titan.nameAr}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{titan.description}</p>
                </div>
                {selectedTitan === titan.id && (
                  <ChevronRight className="w-4 h-4 text-indigo-600" />
                )}
              </button>
            ))}
          </div>
        )}

        {isCouncilMode && (
          <div className="flex-1 p-4">
            <Card className="bg-indigo-50 border-indigo-200">
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-indigo-900">المجلس الكامل</p>
                <p className="text-xs text-indigo-600 mt-1">
                  سيتم استشارة جميع الـ 5 Titans
                </p>
                <div className="flex justify-center gap-1 mt-3">
                  {TITANS.map((t) => (
                    <Avatar key={t.id} className={`w-7 h-7 ${t.bgColor}`}>
                      <AvatarFallback className={`text-xs ${t.color}`}>
                        {t.name[0]}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Stats */}
        <div className="p-4 border-t border-gray-200 text-xs text-gray-400">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {messages.filter((m) => m.role === "user").length} رسالة
            </span>
            <span className="flex items-center gap-1">
              <Bot className="w-3 h-3" />
              {messages.filter((m) => m.role === "assistant").length} رد
            </span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <header className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentTitan.bgColor}`}>
              <span className={currentTitan.color}>{currentTitan.icon}</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isCouncilMode ? "المجلس الكامل" : currentTitan.nameAr}
              </h2>
              <p className="text-xs text-gray-500">
                {isCouncilMode
                  ? "استشارة 5 Titans بالتوازي"
                  : `${currentTitan.domain} — GPT-4o`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentTitan && !isCouncilMode && (
              <Badge variant="outline" className="text-xs gap-1">
                <Sparkles className="w-3 h-3" />
                GPT-4o
              </Badge>
            )}
            {isCouncilMode && (
              <Badge className="bg-indigo-600 text-xs gap-1">
                <Users className="w-3 h-3" />
                Council Mode
              </Badge>
            )}
            {isLoading && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                يفكر...
              </Badge>
            )}
          </div>
        </header>

        {/* Messages Area */}
        <ScrollArea className="flex-1 px-6 py-4">
          {messages.length === 0 ? (
            /* Welcome Screen */
            <div className="h-full flex items-center justify-center">
              <Card className="max-w-lg w-full mx-auto border-0 shadow-none bg-transparent">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {isCouncilMode ? "مجلس الأقمار" : currentTitan.nameAr}
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                    {isCouncilMode
                      ? "اطرح سؤالك وسيستجيب جميع الـ 5 Titans بآرائهم المختلفة"
                      : `اطرح سؤالك على ${currentTitan.nameAr} — متخصص في ${currentTitan.description}`}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-right">
                    {[
                      "ما هو رؤية ONX Intelligence؟",
                      "كيف أبني نظام ذكاء اصطناعي موثوق؟",
                      "ما هي البنية التحتية المثلى؟",
                      "كيف أحسن عمليات التنفيذ؟",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setInputValue(q)}
                        className="p-3 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors text-right"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Messages */
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {msg.role === "user" && (
                    <div className="flex gap-3 justify-end">
                      <div className="flex-1 max-w-[80%]">
                        <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 text-left">
                          {msg.timestamp.toLocaleTimeString("ar-SA")}
                        </p>
                      </div>
                      <Avatar className="w-8 h-8 bg-gray-200">
                        <AvatarFallback>
                          <User className="w-4 h-4 text-gray-600" />
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}

                  {msg.role === "assistant" && (
                    <div className="flex gap-3">
                      <Avatar className={`w-8 h-8 ${
                        TITANS.find((t) => t.id === msg.titanId)?.bgColor || "bg-gray-100"
                      }`}>
                        <AvatarFallback className="text-xs">
                          {TITANS.find((t) => t.id === msg.titanId)?.icon || <Bot className="w-4 h-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 max-w-[80%]">
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                          {msg.isCouncil && (
                            <Badge variant="outline" className="mb-2 text-[10px] gap-1">
                              {TITANS.find((t) => t.id === msg.titanId)?.icon}
                              {msg.titanName}
                            </Badge>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                            {msg.content}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                          <span>{msg.titanName}</span>
                          {msg.tokensUsed && (
                            <>
                              <Hash className="w-3 h-3" />
                              <span>{msg.tokensUsed} tokens</span>
                            </>
                          )}
                          {msg.latencyMs && (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>{msg.latencyMs}ms</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {msg.role === "system" && (
                    <div className="flex justify-center">
                      <p className="text-xs text-amber-700 bg-amber-50 px-4 py-2 rounded-full">
                        {msg.content}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="px-6 py-4 bg-white border-t border-gray-200">
          <div className="max-w-3xl mx-auto flex gap-3">
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isCouncilMode
                    ? "اطرح سؤالك للمجلس الكامل..."
                    : `تحدث مع ${currentTitan.nameAr}...`
                }
                className="pr-4 py-6 text-sm rounded-xl border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                disabled={isLoading}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              className="px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Enter للإرسال — جميع الردود تخضع لمراجعة Apollo الدستورية
          </p>
        </div>
      </main>
    </div>
  );
}
