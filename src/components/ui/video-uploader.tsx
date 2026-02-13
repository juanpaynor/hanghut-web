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

        // Validate file type
        if (!file.type.startsWith('video/')) {
            toast({
                title: "Invalid file type",
                description: "Please upload a video file (MP4, WebM)",
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

        setIsUploading(true)
        setProgress(0)

        try {
            // Get user ID for path consistency with RLS
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Not authenticated")

            const fileExt = file.name.split('.').pop()
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
                            className="h-8 w-8 shadow-sm"
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

            <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={handleFileSelect}
                disabled={disabled || isUploading}
            />
        </div>
    )
}
