'use client'

import { useMemo, useState } from 'react'
import { Lang, LANG_LABELS } from './code-samples'

/**
 * The sandbox console.
 *
 * This replaces the old TryIt, which fired real requests with a real
 * `hh_live_` key. That was useful and genuinely dangerous: the destructive
 * endpoints are refund and check-in, and the only thing between a curious
 * reader and a refunded ticket was a typed confirmation word. A docs page is
 * read by people who do not yet know what the endpoints do — that is why they
 * are reading it.
 *
 * So nothing here leaves the browser. A request is validated against the
 * endpoint's declared parameters and answered from the same fixture the page
 * prints beside it, with a plausible delay. You can safely press Send on
 * `POST /tickets/:id/refund` and learn its response shape without owning a
 * ticket, a key, or a production event.
 *
 * The honest trade: this proves the SHAPE of a call, never that your key works
 * or that your event exists. The panel says so, because a simulated 200 that
 * reads like a real one is worse than no console at all.
 */

export type Risk = 'read' | 'write' | 'destructive'

export interface SandboxField {
    name: string
    /** Prefilled so Send works on first press — the console is useless if the
     *  first thing it does is complain about an empty UUID. */
    value?: string
    placeholder?: string
    required?: boolean
}

export interface SandboxProps {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    /** Path as documented, with `:name` placeholders. */
    path: string
    pathParams?: SandboxField[]
    queryParams?: SandboxField[]
    /** Pretty-printed JSON request body, when the endpoint takes one. */
    body?: string
    risk?: Risk
    /** The fixture to answer with, and the status to answer it under. */
    response: string
    status?: number
    /** Errors this endpoint really returns, offered as alternate outcomes so a
     *  reader can see the failure shape without having to cause a failure. */
    errors?: { status: number; label: string; json: string }[]
}

const BASE = 'https://api.hanghut.com/v1'

const RISK_STYLE: Record<Risk, { label: string; cls: string }> = {
    read: { label: 'Safe', cls: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' },
    write: { label: 'Creates data', cls: 'text-amber-400 bg-amber-500/10 ring-amber-500/20' },
    destructive: { label: 'Destructive', cls: 'text-rose-400 bg-rose-500/10 ring-rose-500/20' },
}

/** `:id` → the value typed for `id`, leaving the placeholder visible until then. */
function resolvePath(path: string, vals: Record<string, string>): string {
    return path.replace(/:([a-zA-Z_]+)/g, (m, name) => vals[name]?.trim() || m)
}

function buildUrl(path: string, pathVals: Record<string, string>, queryVals: Record<string, string>) {
    const qs = Object.entries(queryVals)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.trim())}`)
        .join('&')
    return `${BASE}${resolvePath(path, pathVals)}${qs ? `?${qs}` : ''}`
}

/**
 * The same request, written as the reader would write it.
 *
 * Generated from the live field values rather than a static sample, so what you
 * copy is what you just built — including the parameters you changed. The five
 * languages match the docs' own switcher so a reader never has to translate
 * between two dialects of the same call.
 */
function asCode(lang: Lang, method: string, url: string, body?: string): string {
    const KEY = 'hh_live_your_api_key'
    const hasBody = Boolean(body && method !== 'GET')
    const compact = hasBody ? JSON.stringify(JSON.parse(body!)) : ''

    switch (lang) {
        case 'curl':
            return [
                `curl -X ${method} '${url}' \\`,
                `  -H 'Authorization: Bearer ${KEY}'${hasBody ? ' \\' : ''}`,
                ...(hasBody ? [`  -H 'Content-Type: application/json' \\`, `  -d '${compact}'`] : []),
            ].join('\n')

        case 'javascript':
            return [
                `const res = await fetch('${url}', {`,
                `  method: '${method}',`,
                `  headers: {`,
                `    Authorization: 'Bearer ${KEY}',`,
                ...(hasBody ? [`    'Content-Type': 'application/json',`] : []),
                `  },`,
                ...(hasBody ? [`  body: JSON.stringify(${body!.trim()}),`] : []),
                `})`,
                `const { data } = await res.json()`,
            ].join('\n')

        case 'python':
            return [
                `import requests`,
                ``,
                `res = requests.${method.toLowerCase()}(`,
                `    "${url}",`,
                `    headers={"Authorization": "Bearer ${KEY}"},`,
                ...(hasBody ? [`    json=${body!.trim().replace(/true/g, 'True').replace(/false/g, 'False').replace(/null/g, 'None')},`] : []),
                `)`,
                `data = res.json()["data"]`,
            ].join('\n')

        case 'php':
            return [
                `<?php`,
                `$ch = curl_init('${url}');`,
                `curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`,
                `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method}');`,
                `curl_setopt($ch, CURLOPT_HTTPHEADER, [`,
                `    'Authorization: Bearer ${KEY}',`,
                ...(hasBody ? [`    'Content-Type: application/json',`] : []),
                `]);`,
                ...(hasBody ? [`curl_setopt($ch, CURLOPT_POSTFIELDS, '${compact}');`] : []),
                `$data = json_decode(curl_exec($ch), true)['data'];`,
            ].join('\n')

        case 'ruby':
            return [
                `require 'net/http'`,
                `require 'json'`,
                ``,
                `uri = URI('${url}')`,
                `req = Net::HTTP::${method.charAt(0) + method.slice(1).toLowerCase()}.new(uri)`,
                `req['Authorization'] = 'Bearer ${KEY}'`,
                ...(hasBody ? [`req['Content-Type'] = 'application/json'`, `req.body = ${compact.replace(/"/g, "'")}.to_json`] : []),
                ``,
                `res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }`,
                `data = JSON.parse(res.body)['data']`,
            ].join('\n')
    }
}

export function Sandbox({
    method,
    path,
    pathParams = [],
    queryParams = [],
    body,
    risk = 'read',
    response,
    status = 200,
    errors = [],
}: SandboxProps) {
    const [pathVals, setPathVals] = useState<Record<string, string>>(
        () => Object.fromEntries(pathParams.map(p => [p.name, p.value ?? '']))
    )
    const [queryVals, setQueryVals] = useState<Record<string, string>>(
        () => Object.fromEntries(queryParams.map(p => [p.name, p.value ?? '']))
    )
    const [bodyText, setBodyText] = useState(body ?? '')
    const [outcome, setOutcome] = useState<{ status: number; json: string; ms: number } | null>(null)
    const [busy, setBusy] = useState(false)
    const [bodyError, setBodyError] = useState<string | null>(null)
    const [showCode, setShowCode] = useState(false)
    const [codeLang, setCodeLang] = useState<Lang>('curl')
    const [copied, setCopied] = useState(false)

    const url = useMemo(() => buildUrl(path, pathVals, queryVals), [path, pathVals, queryVals])

    const missing = useMemo(
        () => pathParams.filter(p => p.required !== false && !pathVals[p.name]?.trim()).map(p => p.name),
        [pathParams, pathVals]
    )

    async function send(chosen?: { status: number; json: string }) {
        if (busy) return

        // Parse the body before answering. A console that returns 200 on
        // malformed JSON teaches that the API tolerates it; the real one does not.
        if (bodyText.trim() && method !== 'GET') {
            try {
                JSON.parse(bodyText)
                setBodyError(null)
            } catch (e) {
                setBodyError(e instanceof Error ? e.message : 'Invalid JSON')
                setOutcome(null)
                return
            }
        }

        if (missing.length > 0) return

        setBusy(true)
        const started = performance.now()
        // A visible beat, so the result reads as an answer rather than a reveal.
        await new Promise(r => setTimeout(r, 260 + Math.random() * 220))
        setOutcome({
            status: chosen?.status ?? status,
            json: chosen?.json ?? response,
            ms: Math.round(performance.now() - started),
        })
        setBusy(false)
    }

    const code = useMemo(
        () => asCode(codeLang, method, url, bodyError ? undefined : bodyText),
        [codeLang, method, url, bodyText, bodyError]
    )

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
        } catch {
            // Clipboard is blocked in some embedded contexts; the code is on
            // screen and selectable, so this needs no error state.
        }
    }

    const riskStyle = RISK_STYLE[risk]

    return (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-900/60">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Sandbox</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${riskStyle.cls}`}>
                    {riskStyle.label}
                </span>
                <span className="ml-auto text-[11px] text-zinc-500">simulated · nothing is sent</span>
            </div>

            <div className="p-4 space-y-3">
                <div className="font-mono text-[11px] text-zinc-400 break-all bg-black/40 rounded-lg px-3 py-2 ring-1 ring-zinc-800/60">
                    <span className="text-zinc-200 font-semibold">{method}</span> {url}
                </div>

                {pathParams.length > 0 && (
                    <Fields
                        legend="Path"
                        fields={pathParams}
                        values={pathVals}
                        onChange={(n, v) => setPathVals(s => ({ ...s, [n]: v }))}
                    />
                )}

                {queryParams.length > 0 && (
                    <Fields
                        legend="Query"
                        fields={queryParams}
                        values={queryVals}
                        onChange={(n, v) => setQueryVals(s => ({ ...s, [n]: v }))}
                    />
                )}

                {body !== undefined && method !== 'GET' && (
                    <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Body</label>
                        <textarea
                            value={bodyText}
                            onChange={e => { setBodyText(e.target.value); setBodyError(null) }}
                            spellCheck={false}
                            rows={Math.min(14, bodyText.split('\n').length + 1)}
                            className="w-full font-mono text-[12px] bg-black/40 text-zinc-200 rounded-lg px-3 py-2 ring-1 ring-zinc-800/60 focus:ring-indigo-500/50 outline-hidden resize-y"
                        />
                        {bodyError && (
                            <p className="mt-1.5 text-[11px] text-rose-400">Invalid JSON — {bodyError}</p>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                        onClick={() => send()}
                        disabled={busy || missing.length > 0}
                        className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                    >
                        {busy ? 'Sending…' : 'Send'}
                    </button>

                    {errors.map(e => (
                        <button
                            key={e.status + e.label}
                            onClick={() => send(e)}
                            disabled={busy}
                            className="px-2.5 py-1.5 rounded-lg text-[12px] text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200 hover:ring-zinc-700 disabled:opacity-40 transition-colors"
                            title={`See the ${e.status} response`}
                        >
                            {e.status} {e.label}
                        </button>
                    ))}

                    <button
                        onClick={() => setShowCode(v => !v)}
                        className="ml-auto px-2.5 py-1.5 rounded-lg text-[12px] text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200 hover:ring-zinc-700 transition-colors"
                    >
                        {showCode ? 'Hide code' : 'Copy as code'}
                    </button>
                </div>

                {missing.length > 0 && (
                    <p className="text-[11px] text-zinc-500">
                        Fill {missing.join(', ')} to send.
                    </p>
                )}

                {showCode && (
                    <div className="rounded-lg ring-1 ring-zinc-800/60 overflow-hidden">
                        <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-900/60 border-b border-zinc-800/60">
                            {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
                                <button
                                    key={l}
                                    onClick={() => setCodeLang(l)}
                                    className={`px-2 py-1 rounded text-[11px] transition-colors ${
                                        codeLang === l ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    {LANG_LABELS[l]}
                                </button>
                            ))}
                            <button
                                onClick={copyCode}
                                className="ml-auto px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white transition-colors"
                            >
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <pre className="p-3 bg-black/40 text-[11.5px] leading-relaxed text-zinc-300 overflow-auto max-h-96">
                            <code>{code}</code>
                        </pre>
                    </div>
                )}

                {outcome && (
                    <div className="rounded-lg ring-1 ring-zinc-800/60 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 border-b border-zinc-800/60">
                            <span
                                className={`text-[11px] font-semibold ${
                                    outcome.status < 300 ? 'text-emerald-400' : outcome.status < 500 ? 'text-amber-400' : 'text-rose-400'
                                }`}
                            >
                                {outcome.status}
                            </span>
                            <span className="text-[11px] text-zinc-500">{outcome.ms}ms</span>
                            <span className="ml-auto text-[10px] text-zinc-600 uppercase tracking-wider">simulated</span>
                        </div>
                        <pre className="p-3 bg-black/40 text-[11.5px] leading-relaxed text-zinc-300 overflow-auto max-h-80">
                            <code>{outcome.json}</code>
                        </pre>
                    </div>
                )}
            </div>
        </div>
    )
}

function Fields({
    legend,
    fields,
    values,
    onChange,
}: {
    legend: string
    fields: SandboxField[]
    values: Record<string, string>
    onChange: (name: string, value: string) => void
}) {
    return (
        <div>
            <span className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">{legend}</span>
            <div className="grid sm:grid-cols-2 gap-2">
                {fields.map(f => (
                    <label key={f.name} className="flex items-center gap-2 bg-black/40 rounded-lg px-2.5 py-1.5 ring-1 ring-zinc-800/60 focus-within:ring-indigo-500/50">
                        <span className="font-mono text-[11px] text-zinc-500 shrink-0">{f.name}</span>
                        <input
                            value={values[f.name] ?? ''}
                            onChange={e => onChange(f.name, e.target.value)}
                            placeholder={f.placeholder}
                            spellCheck={false}
                            className="w-full bg-transparent font-mono text-[12px] text-zinc-200 placeholder:text-zinc-700 outline-hidden"
                        />
                    </label>
                ))}
            </div>
        </div>
    )
}
