'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Upload, X, Video, Loader2, Trash2, Link as LinkIcon } from 'lucide-react'
import { cn, getYouTubeEmbedUrl } from '@/lib/utils'

interface VideoUploaderProps {
    value?: string | null
    onChange: (url: string | null) => void
    className?: string
    disabled?: boolean
}

export function VideoUploader({ value, onChange, className, disabled }: VideoUploaderProps) {
    const [isUploading, setIsUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [youtubeInput, setYoutubeInput] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { toast } = useToast()
    const supabase = createClient()

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type.
        //
        // `video/*` was too loose and the toast lied: it said "(MP4, WebM)" while
        // accepting anything. An iPhone .mov sails through as video/quicktime,
        // uploads fine, and then <video> REFUSES it in Chrome and Firefox while
        // Safari plays it happily -- so it looks right to whoever uploaded it from
        // a phone and is a dead black rectangle for most visitors. Axiom's hero
        // video sat broken like that for two days.
        //
        // The codecs inside such a file are usually already H.264/AAC, i.e.
        // web-standard; only the container is wrong. But we cannot remux in the
        // browser, so the honest move is to refuse it and say what to do.
        const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
        const PLAYABLE_TYPES = ['video/mp4', 'video/webm']
        const PLAYABLE_EXTS = ['mp4', 'm4v', 'webm']

        if (!file.type.startsWith('video/')) {
            toast({
                title: "Not a video",
                description: "Pick a video file — MP4 works everywhere.",
                variant: "destructive"
            })
            return
        }

        // Check both: some browsers mislabel the type, others report none at all.
        if (!PLAYABLE_TYPES.includes(file.type) || !PLAYABLE_EXTS.includes(ext)) {
            toast({
                title: `Browsers can't play ${ext ? `.${ext}` : 'that'} files`,
                description: ext === 'mov'
                    ? "A .mov plays on iPhone but not in Chrome or Firefox, so most visitors would see nothing. Export it as MP4 and upload that — in QuickTime it's File › Export As › 1080p."
                    : "Use MP4 (or WebM). Most video apps can export MP4 directly.",
                variant: "destructive"
            })
            return
        }

        // Validate size (100MB)
        if (file.size > 100 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "Video must be under 100MB",
                variant: "destructive"
            })
            return
        }

        // Not a hard stop -- their video, their call -- but a hero video autoplays
        // for every visitor, and most of this audience is on mobile data. The MP4s
        // already on the platform run 3-13MB; the file that prompted this was 61MB.
        if (file.size > 20 * 1024 * 1024) {
            toast({
                title: "That's a big file",
                description: `${Math.round(file.size / 1048576)}MB will autoplay for every visitor, which is slow on mobile data. Under 20MB is a better experience if you can export smaller.`,
            })
        }

        setIsUploading(true)
        setProgress(0)

        try {
            // Get user ID for path consistency with RLS
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Not authenticated")

            const fileExt = file.name.split('.').pop()
            // Bucket + path are both load-bearing and were changed together in a5ba5f4:
            //   - event-covers allows images ONLY, so it rejects video/mp4 at the API.
            //   - the event-videos INSERT policy requires foldername(name)[1] = auth.uid(),
            //     so a 'videos/' prefix pushes the uid to segment 2 and RLS refuses the row.
            // Either one alone is enough to break every upload. Don't "tidy" this path.
            const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

            // Simulate progress
            const progressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 90) return 90
                    return prev + 10
                })
            }, 500)

            const { data, error } = await supabase.storage
                .from('event-videos')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                })

            clearInterval(progressInterval)

            if (error) throw error

            setProgress(100)

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('event-videos')
                .getPublicUrl(data.path)

            onChange(publicUrl)
            toast({
                title: "Upload Complete",
                description: "Video uploaded successfully",
            })

        } catch (error: any) {
            console.error('Upload error:', error)
            toast({
                title: "Upload Failed",
                description: error.message || "Something went wrong",
                variant: "destructive"
            })
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    const handleYoutubeSubmit = () => {
        if (!youtubeInput) return

        const embedUrl = getYouTubeEmbedUrl(youtubeInput)
        if (!embedUrl) {
            toast({
                title: "Invalid URL",
                description: "Please enter a valid YouTube URL (e.g. https://youtu.be/...)",
                variant: "destructive"
            })
            return
        }

        onChange(youtubeInput) // Store original URL, helper converts it to embed where needed
        setYoutubeInput('')
    }

    const handleRemove = () => {
        onChange(null)
        setProgress(0)
    }

    const youtubeEmbed = value ? getYouTubeEmbedUrl(value) : null

    return (
        <div className={cn("w-full space-y-4", className)}>
            {value ? (
                <div className="relative rounded-lg border overflow-hidden bg-muted group">
                    {youtubeEmbed ? (
                        <iframe
                            src={youtubeEmbed}
                            className="w-full h-48 bg-black"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <video
                            src={value}
                            className="w-full h-48 object-cover bg-black"
                            controls
                        />
                    )}

                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8 shadow-xs"
                            onClick={handleRemove}
                            disabled={disabled || isUploading}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="p-2 bg-background border-t flex items-center gap-2">
                        {youtubeEmbed ? <LinkIcon className="h-4 w-4 text-red-500" /> : <Video className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground truncate flex-1">
                            {youtubeEmbed ? 'YouTube Video' : value.split('/').pop()}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={handleRemove}
                            disabled={disabled || isUploading}
                        >
                            Change
                        </Button>
                    </div>
                </div>
            ) : (
                <Tabs defaultValue="upload" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="upload">Upload File</TabsTrigger>
                        <TabsTrigger value="youtube">YouTube URL</TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload">
                        <div
                            onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
                            className={cn(
                                "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors h-[200px]",
                                (disabled || isUploading) && "opacity-50 cursor-not-allowed",
                                isUploading && "pointer-events-none"
                            )}
                        >
                            {isUploading ? (
                                <div className="w-full max-w-xs space-y-4">
                                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">Uploading video...</p>
                                        <Progress value={progress} className="h-2" />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="p-4 bg-primary/10 rounded-full mb-4">
                                        <Upload className="h-8 w-8 text-primary" />
                                    </div>
                                    <h3 className="font-semibold mb-1">Upload Video</h3>
                                    <p className="text-sm text-muted-foreground max-w-xs">
                                        Drag & drop or click to upload. MP4 or WebM up to 100MB.
                                    </p>
                                </>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="youtube">
                        <div className="h-[200px] border rounded-lg p-6 flex flex-col items-center justify-center bg-muted/20">
                            <div className="w-full max-w-sm space-y-4">
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-center">Add via URL</h3>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Paste YouTube link here..."
                                            value={youtubeInput}
                                            onChange={(e) => setYoutubeInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleYoutubeSubmit()}
                                        />
                                        <Button onClick={handleYoutubeSubmit} type="button">
                                            Add
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground text-center">
                                    Supports standard YouTube links and short URLs (youtu.be).
                                </p>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            )}

            {/* NOT video/quicktime. Offering it in the picker is how a .mov got
                onto a live event hero: the dialog presented it as a valid choice,
                the upload succeeded, and then Chrome and Firefox refused to play
                it while Safari did -- invisible to anyone uploading from a phone.
                handleFileSelect rejects it too, because `accept` is only a hint
                and drag-and-drop ignores it entirely. */}
            <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                onChange={handleFileSelect}
                disabled={disabled || isUploading}
            />
        </div>
    )
}
