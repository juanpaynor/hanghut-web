'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Undo, Redo, Strikethrough, Image as ImageIcon, Code2, Eye, PenLine } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
    value: string
    onChange: (html: string) => void
    disabled?: boolean
}

type EditorTab = 'visual' | 'html' | 'preview'

export function RichTextEditor({ value, onChange, disabled }: RichTextEditorProps) {
    const [uploading, setUploading] = useState(false)
    const [activeTab, setActiveTab] = useState<EditorTab>('visual')
    const [rawHtml, setRawHtml] = useState(value)
    const supabase = createClient()

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'text-blue-500 underline',
                },
            }),
            Image.configure({
                inline: true,
                allowBase64: true,
            }),
        ],
        content: value,
        editable: !disabled,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML())
        },
        editorProps: {
            attributes: {
                class: 'min-h-[300px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 prose prose-sm max-w-none dark:prose-invert [&img]:rounded-md [&img]:max-w-full',
            },
        },
    })

    function switchTab(tab: EditorTab) {
        if (tab === activeTab) return
        if (activeTab === 'visual' && editor) {
            // sync visual → raw
            const html = editor.getHTML()
            setRawHtml(html)
        } else if (tab === 'visual' && editor) {
            // sync raw → visual
            editor.commands.setContent(rawHtml)
        }
        setActiveTab(tab)
    }

    if (!editor) {
        return null
    }

    const addImage = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async () => {
            if (input.files?.length) {
                const file = input.files[0]
                setUploading(true)

                try {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user) return

                    // Get partner ID (assuming connected to user) - Simplify by just using user ID folder for now since emails are usually one partner per user
                    // Or ideally fetch partner ID. For speed, using user ID as folder prefix is safer than nothing.
                    const fileExt = file.name.split('.').pop()
                    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
                    const filePath = `${user.id}/${fileName}`

                    const { error: uploadError } = await supabase.storage
                        .from('email-images')
                        .upload(filePath, file)

                    if (uploadError) throw uploadError

                    const { data: urlData } = supabase.storage
                        .from('email-images')
                        .getPublicUrl(filePath)

                    editor.chain().focus().setImage({ src: urlData.publicUrl }).run()
                } catch (error) {
                    console.error('Error uploading image:', error)
                    alert('Failed to upload image')
                } finally {
                    setUploading(false)
                }
            }
        }
        input.click()
    }

    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href
        const url = window.prompt('URL', previousUrl)

        // cancelled
        if (url === null) {
            return
        }

        // empty
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
        }

        // update link
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }

    const tabBtn = (tab: EditorTab, icon: React.ReactNode, label: string) => (
        <button
            type="button"
            onClick={() => switchTab(tab)}
            className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium transition-colors',
                activeTab === tab
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
            )}
        >
            {icon}
            {label}
        </button>
    )

    return (
        <div className="flex flex-col border rounded-md">
            <div className="flex items-center gap-1 p-1 border-b bg-muted/50">
                {activeTab === 'visual' && (
                    <>
                        <Toggle
                            size="sm"
                            pressed={editor.isActive('bold')}
                            onPressedChange={() => editor.chain().focus().toggleBold().run()}
                            disabled={disabled}
                        >
                            <Bold className="h-4 w-4" />
                        </Toggle>
                        <Toggle
                            size="sm"
                            pressed={editor.isActive('italic')}
                            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                            disabled={disabled}
                        >
                            <Italic className="h-4 w-4" />
                        </Toggle>
                        <Toggle
                            size="sm"
                            pressed={editor.isActive('strike')}
                            onPressedChange={() => editor.chain().focus().toggleStrike().run()}
                            disabled={disabled}
                        >
                            <Strikethrough className="h-4 w-4" />
                        </Toggle>

                        <Separator orientation="vertical" className="mx-1 h-6" />

                        <Toggle
                            size="sm"
                            pressed={editor.isActive('bulletList')}
                            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
                            disabled={disabled}
                        >
                            <List className="h-4 w-4" />
                        </Toggle>
                        <Toggle
                            size="sm"
                            pressed={editor.isActive('orderedList')}
                            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
                            disabled={disabled}
                        >
                            <ListOrdered className="h-4 w-4" />
                        </Toggle>

                        <Separator orientation="vertical" className="mx-1 h-6" />

                        <Toggle
                            size="sm"
                            pressed={editor.isActive('link')}
                            onPressedChange={setLink}
                            disabled={disabled}
                        >
                            <LinkIcon className="h-4 w-4" />
                        </Toggle>

                        <Toggle
                            size="sm"
                            onPressedChange={addImage}
                            disabled={disabled || uploading}
                        >
                            <ImageIcon className="h-4 w-4" />
                        </Toggle>

                        <Separator orientation="vertical" className="mx-1 h-6" />

                        <Toggle
                            size="sm"
                            onPressedChange={() => editor.chain().focus().undo().run()}
                            disabled={!editor.can().undo() || disabled}
                        >
                            <Undo className="h-4 w-4" />
                        </Toggle>
                        <Toggle
                            size="sm"
                            onPressedChange={() => editor.chain().focus().redo().run()}
                            disabled={!editor.can().redo() || disabled}
                        >
                            <Redo className="h-4 w-4" />
                        </Toggle>
                    </>
                )}

                <div className="flex-1" />

                <div className="flex items-center gap-0.5 bg-muted rounded p-0.5">
                    {tabBtn('visual', <PenLine className="h-3 w-3" />, 'Visual')}
                    {tabBtn('html', <Code2 className="h-3 w-3" />, 'HTML')}
                    {tabBtn('preview', <Eye className="h-3 w-3" />, 'Preview')}
                </div>
            </div>

            {activeTab === 'visual' && (
                <EditorContent editor={editor} className="flex-1 p-2" />
            )}

            {activeTab === 'html' && (
                <textarea
                    value={rawHtml}
                    onChange={(e) => {
                        setRawHtml(e.target.value)
                        onChange(e.target.value)
                    }}
                    disabled={disabled}
                    spellCheck={false}
                    className="min-h-[300px] w-full resize-y p-3 font-mono text-xs bg-background text-foreground border-0 outline-none focus:ring-0 rounded-b-md"
                    placeholder="Paste or type HTML here…"
                />
            )}

            {activeTab === 'preview' && (
                <iframe
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:600px;margin:24px auto;padding:0 16px}img{max-width:100%;border-radius:4px}a{color:#2563eb}</style></head><body>${rawHtml}</body></html>`}
                    sandbox="allow-same-origin"
                    title="Email preview"
                    className="w-full min-h-[400px] border-0 rounded-b-md bg-white"
                />
            )}
        </div>
    )
}
