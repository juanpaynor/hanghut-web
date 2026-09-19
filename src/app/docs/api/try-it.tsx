'use client'
import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react'

/**
 * Live "Try it" console for the public API docs.
 *
 * Requests go to a RELATIVE /api/v1 path, so the console always exercises the
 * deployment the reader is actually looking at rather than a hardcoded
 * production host — the docs on a preview build test that preview build.
 *
 * There is no sandbox. Keys are `hh_live_` only, and every request here hits
 * the same production data as the partner's own integration: a checkout really
 * reserves inventory, a refund really moves money. That is the whole reason
 * `risk` exists below — the console is deliberately harder to fire the further
 * a call is from read-only.
 */

/* ─── Shared key ─── */

interface KeyCtx {
    apiKey: string
    setApiKey: (k: string) => void
}
const ApiKeyContext = createContext<KeyCtx>({ apiKey: '', setApiKey: () => { } })

/**
 * Holds the key in memory for the life of the page only. Deliberately NOT
 * localStorage: this page is public, frequently opened on a shared or
 * borrowed machine, and a live key that outlives the tab is a key we have
 * quietly helped someone leak.
 */
export function ApiKeyProvider({ children }: { children: ReactNode }) {
    const [apiKey, setApiKey] = useState('')
    const value = useMemo(() => ({ apiKey, setApiKey }), [apiKey])
    return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
}

export function useApiKey() {
    return useContext(ApiKeyContext)
}

/** The key bar. Rendered once near the top; every console below reads from it. */
export function ApiKeyBar() {
    const { apiKey, setApiKey } = useApiKey()
    const [reveal, setReveal] = useState(false)

    return (
        <div className="bg-[#161b22] border border-zinc-800/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Your API key</p>
                {apiKey && (
                    <button
                        onClick={() => setReveal(r => !r)}
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        {reveal ? 'Hide' : 'Show'}
                    </button>
                )}
            </div>
            <input
                type={reveal ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value.trim())}
                placeholder="hh_live_..."
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-[#0d1117] border border-zinc-800/80 rounded-lg px-3 py-2.5 font-mono text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#6c5ce7]/60 focus:ring-1 focus:ring-[#6c5ce7]/30"
            />
            <p className="text-[12px] text-zinc-500 mt-2 leading-relaxed">
                Used only by your browser to call this API directly. It is never stored and never
                sent anywhere else — close the tab and it is gone.
            </p>
        </div>
    )
}

/* ─── Console ─── */

type Risk = 'read' | 'write' | 'destructive'

interface Field {
    name: string
    placeholder?: string
    value?: string
}

interface TryItProps {
    method: 'GET' | 'POST' | 'PUT'
    /** Path template below /api/v1, e.g. `/events/:id/attendees`. */
    path: string
    pathParams?: Field[]
    queryParams?: Field[]
    /** Pretty-printed default request body for write methods. */
    body?: string
    risk?: Risk
    /** Plain sentence naming what a successful call actually does to live data. */
    effect?: string
    /** Word the reader must type to arm a destructive call. */
    confirmWord?: string
}

interface Outcome {
    status: number
    ok: boolean
    ms: number
    timing: string | null
    text: string
}

const RISK_STYLES: Record<Risk, string> = {
    read: 'border-zinc-800/60',
    write: 'border-amber-500/30',
    destructive: 'border-red-500/30',
}

export function TryIt({
    method,
    path,
    pathParams = [],
    queryParams = [],
    body,
    risk = 'read',
    effect,
    confirmWord,
}: TryItProps) {
    const { apiKey } = useApiKey()
    const [open, setOpen] = useState(false)
    const [pathVals, setPathVals] = useState<Record<string, string>>(
        () => Object.fromEntries(pathParams.map(p => [p.name, p.value ?? '']))
    )
    const [queryVals, setQueryVals] = useState<Record<string, string>>(
        () => Object.fromEntries(queryParams.map(p => [p.name, p.value ?? '']))
    )
    const [bodyText, setBodyText] = useState(body ?? '')
    const [acknowledged, setAcknowledged] = useState(false)
    const [typed, setTyped] = useState('')
    const [busy, setBusy] = useState(false)
    const [outcome, setOutcome] = useState<Outcome | null>(null)
    const [problem, setProblem] = useState<string | null>(null)

    /** The exact URL the Send button will hit, shown live as the reader types. */
    const resolvedPath = useMemo(() => {
        let p = path
        for (const { name } of pathParams) {
            p = p.replace(`:${name}`, pathVals[name] ? encodeURIComponent(pathVals[name]) : `:${name}`)
        }
        const qs = new URLSearchParams()
        for (const { name } of queryParams) {
            const v = queryVals[name]
            if (v) qs.set(name, v)
        }
        const q = qs.toString()
        return `/api/v1${p}${q ? `?${q}` : ''}`
    }, [path, pathParams, pathVals, queryParams, queryVals])

    const missingPath = pathParams.filter(p => !pathVals[p.name]).map(p => p.name)

    // Each rung up the risk ladder adds one deliberate act. A read needs a key;
    // a write needs you to say you know it is live; a refund needs you to type
    // the word. Nothing here is reversible by a Back button.
    const armed =
        risk === 'read' ? true
            : risk === 'write' ? acknowledged
                : acknowledged && typed.trim().toUpperCase() === (confirmWord ?? 'CONFIRM')

    const canSend = !!apiKey && missingPath.length === 0 && armed && !busy

    const send = useCallback(async () => {
        setBusy(true)
        setProblem(null)
        setOutcome(null)

        let payload: string | undefined
        if (method !== 'GET' && bodyText.trim()) {
            try {
                // Parse then re-stringify: a trailing comma or a smart quote
                // pasted from a doc should fail HERE, with a pointer to the
                // character, rather than as a confusing 400 from the server.
                payload = JSON.stringify(JSON.parse(bodyText))
            } catch (e) {
                setProblem(`Request body is not valid JSON — ${(e as Error).message}`)
                setBusy(false)
                return
            }
        }

        const t0 = performance.now()
        try {
            const res = await fetch(resolvedPath, {
                method,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    ...(payload ? { 'Content-Type': 'application/json' } : {}),
                },
                body: payload,
            })
            const text = await res.text()
            let pretty = text
            try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* show raw */ }
            setOutcome({
                status: res.status,
                ok: res.ok,
                ms: Math.round(performance.now() - t0),
                // Readable because the console is same-origin with the API.
                // A cross-origin caller cannot see this header unless we add
                // Access-Control-Expose-Headers.
                timing: res.headers.get('Server-Timing'),
                text: pretty,
            })
        } catch (e) {
            setProblem(`Request failed before it reached the API — ${(e as Error).message}`)
        } finally {
            setBusy(false)
        }
    }, [apiKey, bodyText, method, resolvedPath])

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-[#6c5ce7]/10 hover:bg-[#6c5ce7]/20 border border-[#6c5ce7]/30 text-[#a29bfe] hover:text-white rounded-xl px-4 py-2.5 text-[13px] font-medium transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                </svg>
                Try it live
            </button>
        )
    }

    return (
        <div className={`bg-[#161b22] border rounded-xl overflow-hidden ${RISK_STYLES[risk]}`}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Try it live</p>
                <button onClick={() => setOpen(false)} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                    Close
                </button>
            </div>

            <div className="p-4 space-y-3">
                {/* Resolved URL — always visible, so nobody sends a request they
                    have not read. */}
                <div className="bg-[#0d1117] border border-zinc-800/80 rounded-lg px-3 py-2 overflow-x-auto">
                    <code className="text-[12px] font-mono whitespace-nowrap">
                        <span className={method === 'GET' ? 'text-blue-400' : method === 'POST' ? 'text-emerald-400' : 'text-amber-400'}>{method}</span>
                        <span className="text-zinc-400"> {resolvedPath}</span>
                    </code>
                </div>

                {pathParams.length > 0 && (
                    <div className="grid gap-2">
                        {pathParams.map(p => (
                            <label key={p.name} className="block">
                                <span className="text-[11px] font-mono text-emerald-400">{p.name}</span>
                                <input
                                    value={pathVals[p.name] ?? ''}
                                    onChange={e => setPathVals(v => ({ ...v, [p.name]: e.target.value.trim() }))}
                                    placeholder={p.placeholder}
                                    spellCheck={false}
                                    className="mt-1 w-full bg-[#0d1117] border border-zinc-800/80 rounded-lg px-3 py-2 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#6c5ce7]/60"
                                />
                            </label>
                        ))}
                    </div>
                )}

                {queryParams.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                        {queryParams.map(p => (
                            <label key={p.name} className="block">
                                <span className="text-[11px] font-mono text-zinc-500">{p.name}</span>
                                <input
                                    value={queryVals[p.name] ?? ''}
                                    onChange={e => setQueryVals(v => ({ ...v, [p.name]: e.target.value.trim() }))}
                                    placeholder={p.placeholder}
                                    spellCheck={false}
                                    className="mt-1 w-full bg-[#0d1117] border border-zinc-800/80 rounded-lg px-3 py-2 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#6c5ce7]/60"
                                />
                            </label>
                        ))}
                    </div>
                )}

                {method !== 'GET' && (
                    <label className="block">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Body</span>
                        <textarea
                            value={bodyText}
                            onChange={e => setBodyText(e.target.value)}
                            rows={Math.min(14, Math.max(4, bodyText.split('\n').length))}
                            spellCheck={false}
                            className="mt-1 w-full bg-[#0d1117] border border-zinc-800/80 rounded-lg px-3 py-2 font-mono text-[12px] text-zinc-200 leading-relaxed focus:outline-none focus:border-[#6c5ce7]/60 resize-y"
                        />
                    </label>
                )}

                {/* What this call does to live data, before it is possible to make it. */}
                {risk !== 'read' && (
                    <div className={`border rounded-lg p-3 space-y-2.5 ${risk === 'destructive' ? 'bg-red-400/5 border-red-500/20' : 'bg-amber-400/5 border-amber-500/20'}`}>
                        <p className={`text-[12px] leading-relaxed ${risk === 'destructive' ? 'text-red-300' : 'text-amber-300'}`}>
                            <strong>This runs against live data.</strong>{effect ? ` ${effect}` : ''} There is no sandbox
                            and no test key — this is the same API your customers are on.
                        </p>
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={acknowledged}
                                onChange={e => setAcknowledged(e.target.checked)}
                                className="mt-0.5 accent-[#6c5ce7]"
                            />
                            <span className="text-[12px] text-zinc-400">I understand this is not a simulation.</span>
                        </label>
                        {risk === 'destructive' && acknowledged && (
                            <label className="block">
                                <span className="text-[12px] text-zinc-400">
                                    Type <code className="text-red-300 font-mono font-bold">{confirmWord ?? 'CONFIRM'}</code> to enable Send.
                                </span>
                                <input
                                    value={typed}
                                    onChange={e => setTyped(e.target.value)}
                                    spellCheck={false}
                                    autoComplete="off"
                                    className="mt-1 w-full bg-[#0d1117] border border-red-500/30 rounded-lg px-3 py-2 font-mono text-[12px] text-zinc-200 focus:outline-none focus:border-red-500/60"
                                />
                            </label>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <button
                        onClick={send}
                        disabled={!canSend}
                        className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${canSend
                            ? risk === 'destructive'
                                ? 'bg-red-500 hover:bg-red-400 text-white'
                                : 'bg-[#6c5ce7] hover:bg-[#5f4ddb] text-white'
                            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            }`}
                    >
                        {busy ? 'Sending…' : 'Send'}
                    </button>
                    {/* One reason at a time, in the order the reader can fix them. */}
                    <span className="text-[12px] text-zinc-500">
                        {!apiKey
                            ? 'Paste your API key above to enable.'
                            : missingPath.length > 0
                                ? `Fill in ${missingPath.join(', ')}.`
                                : !armed
                                    ? 'Confirm above to enable.'
                                    : ''}
                    </span>
                </div>

                {problem && (
                    <div className="bg-red-400/5 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-300 leading-relaxed">
                        {problem}
                    </div>
                )}

                {outcome && (
                    <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${outcome.ok
                                ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                                : outcome.status < 500
                                    ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                                    : 'text-red-400 bg-red-400/10 border-red-400/20'
                                }`}>
                                {outcome.status}
                            </span>
                            <span className="text-[11px] text-zinc-500 font-mono">{outcome.ms}ms round trip</span>
                            {outcome.timing && (
                                <span className="text-[11px] text-zinc-600 font-mono truncate">· server {outcome.timing}</span>
                            )}
                        </div>
                        <pre className="bg-[#0d1117] border border-zinc-800/80 rounded-lg p-3 text-[12px] font-mono leading-relaxed text-zinc-300 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre">
                            {outcome.text}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    )
}
