'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
    Upload, X, Loader2, Globe, Instagram, Facebook, Twitter,
    Layout, Store, Image as ImageIcon, CheckCircle2, AlertCircle, Palette, LayoutTemplate, SquareDashedBottom,
    Type, Sparkles, Megaphone, ListFilter, History
} from 'lucide-react'
import { updatePartnerProfile } from '@/lib/organizer/settings-actions'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface PartnerSettingsFormProps {
    initialData: {
        business_name: string
        description?: string
        slug?: string
        profile_photo_url?: string
        cover_image_url?: string
        social_links?: {
            facebook?: string
            instagram?: string
            twitter?: string
            website?: string
        }
        branding?: {
            colors?: {
                primary?: string
                secondary?: string
                accent?: string
            }
            design?: {
                layout?: 'modern' | 'classic'
                font?: 'sans' | 'serif' | 'mono'
                enable_animations?: boolean
                show_footer?: boolean
            }
            announcement?: {
                enabled?: boolean
                text?: string
                link?: string
            }
            content?: {
                sort_by?: 'upcoming' | 'newest' | 'alpha'
                show_past_events?: boolean
            }
        }
    }
}

export function PartnerSettingsForm({ initialData }: PartnerSettingsFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [errors, setErrors] = useState<Record<string, any>>({})
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        business_name: initialData.business_name || '',
        description: initialData.description || '',
        slug: initialData.slug || '',
        social_links: {
            facebook: initialData.social_links?.facebook || '',
            instagram: initialData.social_links?.instagram || '',
            twitter: initialData.social_links?.twitter || '',
            website: initialData.social_links?.website || '',
        },
        branding: {
            colors: {
                primary: initialData.branding?.colors?.primary || '#000000',
                secondary: initialData.branding?.colors?.secondary || '',
                accent: initialData.branding?.colors?.accent || ''
            },
            design: {
                layout: initialData.branding?.design?.layout || 'modern',
                font: initialData.branding?.design?.font || 'sans',
                show_footer: initialData.branding?.design?.show_footer ?? true,
                enable_animations: initialData.branding?.design?.enable_animations ?? true
            },
            announcement: {
                enabled: initialData.branding?.announcement?.enabled ?? false,
                text: initialData.branding?.announcement?.text || '',
                link: initialData.branding?.announcement?.link || ''
            },
            content: {
                sort_by: initialData.branding?.content?.sort_by || 'upcoming',
                show_past_events: initialData.branding?.content?.show_past_events ?? false
            }
        }
    })

    const [logoPreview, setLogoPreview] = useState<string | null>(initialData.profile_photo_url || null)
    const [logoFile, setLogoFile] = useState<File | null>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)

    const [coverPreview, setCoverPreview] = useState<string | null>(initialData.cover_image_url || null)
    const [coverFile, setCoverFile] = useState<File | null>(null)
    const coverInputRef = useRef<HTMLInputElement>(null)

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        // Clear specific error
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors[field]
                return newErrors
            })
        }
        setSuccessMessage(null)
    }

    const handleBrandingChange = (category: 'colors' | 'design' | 'announcement' | 'content', field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            branding: {
                ...prev.branding,
                [category]: {
                    ...prev.branding[category as keyof typeof prev.branding],
                    [field]: value
                }
            }
        }))
        setSuccessMessage(null)
    }

    const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Enforce slug format in real-time
        const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
        handleInputChange('slug', value)
    }

    const handleSocialChange = (network: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            social_links: { ...prev.social_links, [network]: value }
        }))
        setSuccessMessage(null)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'cover') => {
        const file = e.target.files?.[0]
        if (!file) return

        const maxSize = type === 'logo' ? 2 * 1024 * 1024 : 5 * 1024 * 1024
        const maxSizeLabel = type === 'logo' ? '2MB' : '5MB'

        if (file.size > maxSize) {
            toast({
                title: "File too large",
                description: `Image must be less than ${maxSizeLabel}`,
                variant: "destructive"
            })
            return
        }

        const previewUrl = URL.createObjectURL(file)
        if (type === 'logo') {
            setLogoFile(file)
            setLogoPreview(previewUrl)
        } else {
            setCoverFile(file)
            setCoverPreview(previewUrl)
        }
        setSuccessMessage(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setErrors({})
        setSuccessMessage(null)

        try {
            const data = new FormData()
            data.append('business_name', formData.business_name)
            data.append('description', formData.description)
            data.append('slug', formData.slug)

            data.append('facebook', formData.social_links.facebook)
            data.append('instagram', formData.social_links.instagram)
            data.append('twitter', formData.social_links.twitter)
            data.append('website', formData.social_links.website)

            // Append Branding as JSON
            data.append('branding', JSON.stringify(formData.branding))

            if (logoFile) data.append('profile_photo', logoFile)
            if (coverFile) data.append('cover_image', coverFile)

            if (initialData.profile_photo_url) data.append('profile_photo_url', initialData.profile_photo_url)
            if (initialData.cover_image_url) data.append('cover_image_url', initialData.cover_image_url)

            const result = await updatePartnerProfile(undefined, data)

            if (result.errors) {
                setErrors(result.errors)
                const firstError = Object.values(result.errors).flat()[0] as string
                toast({ title: "Validation Error", description: firstError, variant: "destructive" })
            } else if (result.message && !result.message.includes('success')) {
                toast({ title: "Error", description: result.message, variant: "destructive" })
            } else {
                setSuccessMessage("Your storefront has been updated successfully!")
                toast({ title: "Success", description: "Profile updated successfully!" })
                router.refresh()
            }

        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Something went wrong.", variant: "destructive" })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="max-w-6xl mx-auto pb-32 animate-in fade-in duration-500">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b pb-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Storefront Settings</h1>
                    <p className="text-muted-foreground mt-1 text-lg">
                        Customize how your organization appears to the public.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push(`/${formData.slug || ''}`)}
                        disabled={!formData.slug}
                    >
                        <Store className="h-4 w-4 mr-2" />
                        View Live Store
                    </Button>
                    <Button type="submit" size="lg" disabled={isLoading} className={cn("min-w-[140px]", successMessage ? "bg-green-600 hover:bg-green-700" : "")}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (successMessage ? <><CheckCircle2 className="h-4 w-4 mr-2" /> Saved</> : 'Save Changes')}
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="general" className="space-y-8">
                <TabsList className="grid w-full max-w-sm grid-cols-2 mb-8">
                    <TabsTrigger value="general" className="flex items-center gap-2">
                        <Store className="h-4 w-4" /> General Info
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="flex items-center gap-2">
                        <Palette className="h-4 w-4" /> Appearance
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Left Sidebar - Navigation / Preview Hint */}
                        <div className="lg:col-span-4 space-y-6">
                            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Layout className="h-5 w-5 text-primary" />
                                        Preview
                                    </CardTitle>
                                    <CardDescription>
                                        This is a simulation of how your branding card looks.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="bg-background rounded-xl p-6 border shadow-sm text-center relative overflow-hidden">
                                        {coverPreview && (
                                            <div className="absolute top-0 left-0 w-full h-16 bg-cover bg-center opacity-50" style={{ backgroundImage: `url(${coverPreview})` }} />
                                        )}
                                        <div className="relative mt-4">
                                            <div className="w-20 h-20 rounded-full mx-auto border-4 border-background bg-muted flex items-center justify-center overflow-hidden shadow-md">
                                                {logoPreview ? (
                                                    <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-xl font-bold text-muted-foreground">Logo</span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-lg mt-3 truncate">{formData.business_name || 'Organization Name'}</h3>
                                            <p className="text-xs text-muted-foreground">@{formData.slug || 'slug'}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Tips</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground space-y-3">
                                    <p>• Use a square PNG image for your logo (min 500x500px).</p>
                                    <p>• Cover images look best at 1920x600px resolution.</p>
                                    <p>• Your slug should be short and easy to remember.</p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Main Form Fields */}
                        <div className="lg:col-span-8 space-y-8">

                            {/* General Info Section */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>General Information</CardTitle>
                                    <CardDescription>Basic details about your organization.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="business_name">Display Name *</Label>
                                            <Input
                                                id="business_name"
                                                value={formData.business_name}
                                                onChange={(e) => handleInputChange('business_name', e.target.value)}
                                                placeholder="e.g. Acme Events"
                                                className={cn(errors.business_name && "border-red-500")}
                                            />
                                            {errors.business_name && <p className="text-red-500 text-sm mt-1">{errors.business_name}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="slug">
                                                Store URL *
                                                {formData.slug && (
                                                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                                                        (hanghut.com/{formData.slug})
                                                    </span>
                                                )}
                                            </Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground/50">
                                                    <Globe className="h-4 w-4" />
                                                </div>
                                                <Input
                                                    id="slug"
                                                    value={formData.slug}
                                                    onChange={handleSlugChange}
                                                    placeholder="my-brand-name"
                                                    className={cn("pl-9", errors.slug && "border-red-500")}
                                                />
                                            </div>
                                            {errors.slug && <p className="text-red-500 text-sm mt-1">{errors.slug}</p>}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="description">Bio / Description</Label>
                                        <Textarea
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) => handleInputChange('description', e.target.value)}
                                            placeholder="Tell the world what your organization is about..."
                                            rows={4}
                                            className="resize-none"
                                        />
                                        <p className="text-xs text-muted-foreground text-right">
                                            {formData.description.length} / 500 characters
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Branding Assets Section */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Branding Assets</CardTitle>
                                    <CardDescription>Upload your logo and store cover image.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Logo Upload */}
                                        <div>
                                            <Label className="mb-2 block">Logo</Label>
                                            <div
                                                onClick={() => logoInputRef.current?.click()}
                                                className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors aspect-square md:aspect-video relative group overflow-hidden"
                                            >
                                                {logoPreview ? (
                                                    <>
                                                        <img src={logoPreview} alt="Logo" className="w-32 h-32 object-contain z-10" />
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                                                            <p className="text-white font-medium flex items-center gap-2"><Upload className="h-4 w-4" /> Change Logo</p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="text-center">
                                                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                                                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                                        </div>
                                                        <p className="text-sm font-medium">Upload Logo</p>
                                                        <p className="text-xs text-muted-foreground mt-1">Max 2MB</p>
                                                    </div>
                                                )}
                                                <input
                                                    ref={logoInputRef}
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => handleFileChange(e, 'logo')}
                                                />
                                            </div>
                                        </div>

                                        {/* Cover Upload */}
                                        <div>
                                            <Label className="mb-2 block">Cover Image</Label>
                                            <div
                                                onClick={() => coverInputRef.current?.click()}
                                                className="border-2 border-dashed rounded-xl p-0 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors h-full min-h-[160px] relative group overflow-hidden"
                                            >
                                                {coverPreview ? (
                                                    <>
                                                        <img src={coverPreview} alt="Cover" className="w-full h-full object-cover z-10" />
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                                                            <p className="text-white font-medium flex items-center gap-2"><Upload className="h-4 w-4" /> Change Cover</p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="text-center p-6">
                                                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                                                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                                        </div>
                                                        <p className="text-sm font-medium">Upload Cover Image</p>
                                                        <p className="text-xs text-muted-foreground mt-1">16:9 Recommended, Max 5MB</p>
                                                    </div>
                                                )}
                                                <input
                                                    ref={coverInputRef}
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => handleFileChange(e, 'cover')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Social Links Section */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Social Media</CardTitle>
                                    <CardDescription>Link your other profiles to build trust.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Facebook</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                    <Facebook className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <Input
                                                    className="pl-9"
                                                    placeholder="facebook.com/page"
                                                    value={formData.social_links.facebook}
                                                    onChange={(e) => handleSocialChange('facebook', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Instagram</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                    <Instagram className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <Input
                                                    className="pl-9"
                                                    placeholder="instagram.com/profile"
                                                    value={formData.social_links.instagram}
                                                    onChange={(e) => handleSocialChange('instagram', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Twitter / X</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                    <Twitter className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <Input
                                                    className="pl-9"
                                                    placeholder="x.com/handle"
                                                    value={formData.social_links.twitter}
                                                    onChange={(e) => handleSocialChange('twitter', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Website</Label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <Input
                                                    className="pl-9"
                                                    placeholder="https://your-website.com"
                                                    value={formData.social_links.website}
                                                    onChange={(e) => handleSocialChange('website', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="appearance">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-8 space-y-8">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Design & Layout</CardTitle>
                                    <CardDescription>Choose how you want your storefront to look.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div
                                            onClick={() => handleBrandingChange('design', 'layout', 'modern')}
                                            className={cn(
                                                "cursor-pointer border-2 rounded-xl p-4 hover:border-primary/50 transition-colors flex flex-col gap-2",
                                                formData.branding.design.layout === 'modern' ? "border-primary bg-primary/5" : "border-border"
                                            )}
                                        >
                                            <div className="w-full h-32 bg-muted rounded-lg flex gap-2 p-2 overflow-hidden">
                                                <div className="w-1/3 bg-background rounded border shadow-sm h-full" />
                                                <div className="w-2/3 space-y-2">
                                                    <div className="w-full h-24 bg-background rounded border shadow-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="font-semibold flex items-center gap-2"><LayoutTemplate className="h-4 w-4" /> Modern Split</p>
                                                <p className="text-sm text-muted-foreground">Profile sidebar on left, content on right. Best for dense content.</p>
                                            </div>
                                        </div>

                                        <div
                                            onClick={() => handleBrandingChange('design', 'layout', 'classic')}
                                            className={cn(
                                                "cursor-pointer border-2 rounded-xl p-4 hover:border-primary/50 transition-colors flex flex-col gap-2",
                                                formData.branding.design.layout === 'classic' ? "border-primary bg-primary/5" : "border-border"
                                            )}
                                        >
                                            <div className="w-full h-32 bg-muted rounded-lg space-y-2 p-2 overflow-hidden">
                                                <div className="w-full h-12 bg-background rounded border shadow-sm" />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="h-16 bg-background rounded border shadow-sm" />
                                                    <div className="h-16 bg-background rounded border shadow-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="font-semibold flex items-center gap-2"><Layout className="h-4 w-4" /> Classic Hero</p>
                                                <p className="text-sm text-muted-foreground">Large hero image with centered branding. Traditional and impactful.</p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Event Display</CardTitle>
                                    <CardDescription>Control how your events appear to visitors.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-3">
                                        <Label className="flex items-center gap-2"><ListFilter className="h-4 w-4" /> Default Sort Order</Label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { value: 'upcoming', label: 'Soonest' },
                                                { value: 'newest', label: 'Newest' },
                                                { value: 'alpha', label: 'A-Z' },
                                            ].map((sort) => (
                                                <div
                                                    key={sort.value}
                                                    onClick={() => handleBrandingChange('content', 'sort_by', sort.value)}
                                                    className={cn(
                                                        "cursor-pointer border rounded-lg py-3 px-2 text-center text-sm font-medium hover:border-primary/50 transition-colors",
                                                        formData.branding.content.sort_by === sort.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                                                    )}
                                                >
                                                    {sort.label}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Show Past Events</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Display ended events in a history section.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={formData.branding.content.show_past_events}
                                            onCheckedChange={(checked) => handleBrandingChange('content', 'show_past_events', checked)}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Theme Colors</CardTitle>
                                    <CardDescription>Define your brand's color palette.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label>Primary Brand Color</Label>
                                            <div className="flex gap-4 items-center">
                                                <div className="h-12 w-12 rounded-lg border shadow-sm overflow-hidden relative cursor-pointer">
                                                    <Input
                                                        type="color"
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        value={formData.branding.colors.primary}
                                                        onChange={(e) => handleBrandingChange('colors', 'primary', e.target.value)}
                                                    />
                                                    <div className="w-full h-full" style={{ backgroundColor: formData.branding.colors.primary }} />
                                                </div>
                                                <Input
                                                    value={formData.branding.colors.primary}
                                                    onChange={(e) => handleBrandingChange('colors', 'primary', e.target.value)}
                                                    className="font-mono"
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">Used for buttons, links, and key highlights.</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Typography</CardTitle>
                                    <CardDescription>Select the font style that matches your brand.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {[
                                            { value: 'sans', label: 'Modern', desc: 'Clean & Minimal', font: 'font-sans' },
                                            { value: 'serif', label: 'Elegant', desc: 'Classic & Trustworthy', font: 'font-serif' },
                                            { value: 'mono', label: 'Technical', desc: 'Bold & Digital', font: 'font-mono' },
                                        ].map((font) => (
                                            <div
                                                key={font.value}
                                                onClick={() => handleBrandingChange('design', 'font', font.value)}
                                                className={cn(
                                                    "cursor-pointer border-2 rounded-xl p-4 hover:border-primary/50 transition-colors flex flex-col gap-2 text-center",
                                                    formData.branding.design.font === font.value ? "border-primary bg-primary/5" : "border-border"
                                                )}
                                            >
                                                <div className="text-3xl font-bold mb-2">Aa</div>
                                                <div>
                                                    <p className={cn("font-semibold", font.font)}>{font.label}</p>
                                                    <p className="text-xs text-muted-foreground">{font.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Announcement Bar</CardTitle>
                                    <CardDescription>Display a banner at the top of your store.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center justify-between pb-4 border-b">
                                        <div className="space-y-0.5">
                                            <Label className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" /> Enable Announcement</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Show a dismissible banner for special news or sales.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={formData.branding.announcement.enabled}
                                            onCheckedChange={(checked) => handleBrandingChange('announcement', 'enabled', checked)}
                                        />
                                    </div>

                                    {formData.branding.announcement.enabled && (
                                        <div className="grid gap-4 animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-2">
                                                <Label>Announcement Text</Label>
                                                <Input
                                                    placeholder="e.g. Grand Opening Sale - 50% Off Tickets!"
                                                    value={formData.branding.announcement.text}
                                                    onChange={(e) => handleBrandingChange('announcement', 'text', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Link URL (Optional)</Label>
                                                <Input
                                                    placeholder="https://..."
                                                    value={formData.branding.announcement.link}
                                                    onChange={(e) => handleBrandingChange('announcement', 'link', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Page Experience</CardTitle>
                                    <CardDescription>Fine-tune user interaction details.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Scroll Animations</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Elements fade in smoothly as users scroll down.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={formData.branding.design.enable_animations}
                                            onCheckedChange={(checked) => handleBrandingChange('design', 'enable_animations', checked)}
                                        />
                                    </div>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base flex items-center gap-2"><SquareDashedBottom className="h-4 w-4" /> Show Footer</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Display social links and copyright at the bottom.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={formData.branding.design.show_footer}
                                            onCheckedChange={(checked) => handleBrandingChange('design', 'show_footer', checked)}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="lg:col-span-4">
                            <Card className="sticky top-6">
                                <CardHeader>
                                    <CardTitle>Style Preview</CardTitle>
                                    <CardDescription>Preview how your primary color looks.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Button className="w-full" style={{ backgroundColor: formData.branding.colors.primary }}>
                                            Primary Button
                                        </Button>
                                        <Button variant="outline" className="w-full" style={{ color: formData.branding.colors.primary, borderColor: formData.branding.colors.primary }}>
                                            Secondary Button
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </form>
    )
}
