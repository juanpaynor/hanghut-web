'use client'
import { useState, useCallback } from 'react'
import { Lang, LANG_LABELS, CodeSample } from './code-samples'

/* ═══════════════════════════════════════════
   CodeBlock — tabbed code block with copy
   ═══════════════════════════════════════════ */
export function CodeBlock({ samples, activeLang, label }: { samples: CodeSample; activeLang: Lang; label?: string }) {
    const [copied, setCopied] = useState(false)
    const code = samples[activeLang]

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [code])

    return (
        <div className="group relative">
            {label && <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">{label}</p>}
            <div className="relative bg-[#0d1117] border border-zinc-800/80 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 bg-[#161b22]">
                    <span className="text-[11px] font-mono text-zinc-500">{LANG_LABELS[activeLang]}</span>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                    >
                        {copied ? (
                            <>
                                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                <span className="text-emerald-400">Copied</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth={2}/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth={2}/></svg>
                                Copy
                            </>
                        )}
                    </button>
                </div>
                <pre className="p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300 whitespace-pre">{code}</pre>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════
   ResponseBlock — JSON response preview
   ═══════════════════════════════════════════ */
export function ResponseBlock({ status, json }: { status: number; json: string }) {
    const [copied, setCopied] = useState(false)
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(json)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [json])

    const statusColor = status < 300 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : status < 500 ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'

    return (
        <div className="relative">
            <div className="flex items-center gap-2 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Response</p>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${statusColor}`}>{status}</span>
            </div>
            <div className="relative bg-[#0d1117] border border-zinc-800/80 rounded-xl overflow-hidden">
                <div className="flex items-center justify-end px-4 py-2 border-b border-zinc-800/60 bg-[#161b22]">
                    <button onClick={handleCopy} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800">
                        {copied ? (
                            <><svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-emerald-400">Copied</span></>
                        ) : (
                            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth={2}/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth={2}/></svg>Copy</>
                        )}
                    </button>
                </div>
                <pre className="p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300 whitespace-pre">{json}</pre>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════
   MethodBadge
   ═══════════════════════════════════════════ */
const METHOD_STYLES: Record<string, string> = {
    GET: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    POST: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export function MethodBadge({ method }: { method: string }) {
    return (
        <span className={`text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-md border font-mono ${METHOD_STYLES[method] || ''}`}>
            {method}
        </span>
    )
}

/* ═══════════════════════════════════════════
   ParamTable
   ═══════════════════════════════════════════ */
interface Param {
    name: string
    type: string
    required?: boolean
    description: string
    default?: string
}

export function ParamTable({ title, params }: { title: string; params: Param[] }) {
    return (
        <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{title}</p>
            <div className="border border-zinc-800/60 rounded-xl overflow-hidden bg-[#0d1117]/50">
                <table className="w-full text-[13px]">
                    <tbody className="divide-y divide-zinc-800/40">
                        {params.map(p => (
                            <tr key={p.name} className="hover:bg-zinc-800/30 transition-colors">
                                <td className="px-4 py-3 font-mono text-emerald-400 whitespace-nowrap w-36">{p.name}</td>
                                <td className="px-4 py-3 text-zinc-500 font-mono text-[11px] w-20">{p.type}</td>
                                <td className="px-4 py-3 text-zinc-400">
                                    {p.description}
                                    {p.required && <span className="text-red-400 text-[10px] font-bold ml-2 bg-red-400/10 px-1.5 py-0.5 rounded">REQUIRED</span>}
                                    {p.default && <span className="text-zinc-600 text-[11px] ml-2">Default: {p.default}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════
   StatusTable
   ═══════════════════════════════════════════ */
export function StatusTable({ rows }: { rows: { status: string; desc: string; color: string }[] }) {
    return (
        <div className="border border-zinc-800/60 rounded-xl overflow-hidden bg-[#0d1117]/50">
            <table className="w-full text-[13px]">
                <tbody className="divide-y divide-zinc-800/40">
                    {rows.map(r => (
                        <tr key={r.status} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-4 py-3 w-36">
                                <span className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${r.color}`} />
                                    <code className="font-mono text-zinc-300">{r.status}</code>
                                </span>
                            </td>
                            <td className="px-4 py-3 text-zinc-400">{r.desc}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/* ═══════════════════════════════════════════
   AlertBox
   ═══════════════════════════════════════════ */
export function AlertBox({ type, children }: { type: 'warning' | 'info' | 'success'; children: React.ReactNode }) {
    const styles = {
        warning: 'bg-amber-400/5 border-amber-500/20 text-amber-300',
        info: 'bg-blue-400/5 border-blue-500/20 text-blue-300',
        success: 'bg-emerald-400/5 border-emerald-500/20 text-emerald-300',
    }

    return (
        <div className={`border rounded-lg p-3.5 text-[13px] leading-relaxed ${styles[type]}`}>
            {children}
        </div>
    )
}

/* ═══════════════════════════════════════════
   LanguageSwitcher — global lang tabs
   ═══════════════════════════════════════════ */
const LANGS: Lang[] = ['curl', 'javascript', 'python', 'php', 'ruby']

export function LanguageSwitcher({ active, onChange }: { active: Lang; onChange: (l: Lang) => void }) {
    return (
        <div className="flex items-center gap-1 bg-[#161b22] border border-zinc-800/60 rounded-lg p-1">
            {LANGS.map(lang => (
                <button
                    key={lang}
                    onClick={() => onChange(lang)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${active === lang
                        ? 'bg-[#6c5ce7] text-white shadow-lg shadow-[#6c5ce7]/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                        }`}
                >
                    {LANG_LABELS[lang]}
                </button>
            ))}
        </div>
    )
}
