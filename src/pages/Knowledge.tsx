import { useState } from 'react'
import { trpc } from '../lib/trpc'
import BackButton from '../components/BackButton'

export default function Knowledge() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const statsQ = trpc.knowledge.stats.useQuery()
  const domainsQ = trpc.knowledge.domains.useQuery()
  const trendingQ = trpc.knowledge.trending.useQuery({ limit: 8 })
  const searchQ = trpc.knowledge.search.useQuery({ query: submitted, limit: 10 }, { enabled: !!submitted })
  const semanticMut = trpc.knowledge.semanticSearch.useMutation()

  function handleSearch(semantic = false) {
    if (!query.trim()) return
    if (semantic) {
      semanticMut.mutate({ query, limit: 8 })
    } else {
      setSubmitted(query)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-indigo-400">📚 قاعدة المعرفة</h1>
          <p className="text-gray-400 mt-1">22,500 سجل • 19 مجال • بحث دلالي بـ GPT-4o</p>
        </div>

        {/* Stats Row */}
        {statsQ.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "إجمالي السجلات", value: statsQ.data.totalRecords.toLocaleString(), color: "text-indigo-400" },
              { label: "المجالات", value: statsQ.data.domains, color: "text-blue-400" },
              { label: "عمليات البحث", value: statsQ.data.totalSearches, color: "text-purple-400" },
              { label: "متوسط الثقة", value: statsQ.data.avgConfidence, color: "text-green-400" },
            ].map((c) => (
              <div key={c.label} className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-gray-400 text-sm mt-1">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search Box */}
        <div className="bg-gray-900 border border-indigo-700 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-bold mb-3 text-indigo-300">🔍 البحث في قاعدة المعرفة</h2>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="ابحث في قاعدة المعرفة..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button onClick={() => handleSearch()} className="bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-lg text-sm font-bold">
              بحث عادي
            </button>
            <button onClick={() => handleSearch(true)} className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-lg text-sm font-bold">
              🧠 بحث دلالي
            </button>
          </div>

          {/* Semantic Results */}
          {semanticMut.data && (
            <div className="mt-4">
              <div className="text-sm text-gray-400 mb-2">
                المجالات: {semanticMut.data.semanticDomains.join(', ')} • {semanticMut.data.returned} نتيجة
              </div>
              <div className="space-y-2">
                {semanticMut.data.results.map((r) => (
                  <div key={r.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                    <div className="flex justify-between">
                      <span className="font-bold text-sm text-indigo-300">{r.title}</span>
                      <span className="text-xs text-gray-500">{r.domain} • {r.score.toFixed(0)}pts</span>
                    </div>
                    <p className="text-gray-400 text-xs mt-1">{r.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {semanticMut.isPending && <div className="text-center text-indigo-400 mt-4">🧠 يحلل الاستعلام دلالياً...</div>}

          {/* Regular Results */}
          {searchQ.data && !semanticMut.data && (
            <div className="mt-4 space-y-2">
              {searchQ.data.results.map((r) => (
                <div key={r.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <div className="flex justify-between">
                    <span className="font-bold text-sm text-indigo-300">{r.title}</span>
                    <span className="text-xs text-gray-500">{r.domain} • {r.score.toFixed(0)}pts</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Domains + Trending */}
        <div className="grid md:grid-cols-2 gap-6">
          {domainsQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h2 className="text-lg font-bold mb-3 text-blue-300">🗂️ المجالات (19)</h2>
              <div className="grid grid-cols-2 gap-2">
                {domainsQ.data.domains.slice(0, 12).map((d) => (
                  <div key={d.id} className="bg-gray-800 rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-indigo-300">{d.nameAr}</div>
                    <div className="text-xs text-gray-500">{d.recordCount.toLocaleString()} سجل</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trendingQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h2 className="text-lg font-bold mb-3 text-purple-300">🔥 الأكثر وصولاً</h2>
              <div className="space-y-2">
                {trendingQ.data.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-600 w-5">{i + 1}.</span>
                    <span className="text-gray-300 flex-1 truncate">{r.title}</span>
                    <span className="text-gray-500 text-xs">{r.accessCount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
