'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { updatePartnerBranding, uploadBrandingImage } from '@/lib/organizer/branding-actions'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Upload, ImageIcon, Palette, Globe, Mail, Phone, Instagram, Facebook } from 'lucide-react'
import Image from 'next/image'

interface BrandingFormProps {
    partner: {
        id: string
        branding: any
    }
}

export function BrandingForm({ partner }: BrandingFormProps) {
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [isUploadingCover, setIsUploadingCover] = useState(false)
    const [isUploadingFavicon, setIsUploadingFavicon] = useState(false)

    const [formData, setFormData] = useState({
        colors: {
            primary: partner.branding?.colors?.primary || '#000000',
            secondary: partner.branding?.colors?.secondary || '#ffffff',
            accent: partner.branding?.colors?.accent || '#3b82f6',
        },
        cover_image_url: partner.branding?.cover_image_url || '',
        favicon_url: partner.branding?.favicon_url || '',
        bio: partner.branding?.bio || '',
        tagline: partner.branding?.tagline || '',
        social_links: {
            instagram: partner.branding?.social_links?.instagram || '',
            facebook: partner.branding?.social_links?.facebook || '',
            website: partner.branding?.social_links?.website || '',
        },
        contact_display: {
            email: partner.branding?.contact_display?.email ?? true,
            phone: partner.branding?.contact_display?.phone ?? false,
        },
    })

    const coverInputRef = useRef<HTMLInputElement>(null)
    const faviconInputRef = useRef<HTMLInputElement>(null)

    const handleColorChange = (type: 'primary' | 'secondary' | 'accent', value: string) => {
        setFormData(prev => ({
            ...prev,
            colors: { ...prev.colors, [type]: value }
        }))
    }

    const handleSocialChange = (type: 'instagram' | 'facebook' | 'website', value: string) => {
        setFormData(prev => ({
            ...prev,
            social_links: { ...prev.social_links, [type]: value }
        }))
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'favicon') => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast({
                title: "File too large",
                description: "Image must be under 5MB",
                variant: "destructive"
            })
            return
        }

        const setter = type === 'cover' ? setIsUploadingCover : setIsUploadingFavicon
        setter(true)

        try {
            const result = await uploadBrandingImage(partner.id, file, type)
            if (result.error) {
                toast({
                    title: "Upload Failed",
                    description: result.error,
                    variant: "destructive"
                })
            } else if (result.url) {
                setFormData(prev => ({
                    ...prev,
                    [`${type}_image_url`]: result.url
                }))
                toast({
                    title: "Success",
                    description: "Image uploaded successfully"
                })
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to upload image",
                variant: "destructive"
            })
        } finally {
            setter(false)
        }
    }

    const handleSubmit = async () => {
        setIsLoading(true)
        try {
            const result = await updatePartnerBranding(partner.id, formData)
            if (result.error) {
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                toast({
                    title: "Success",
                    description: "Branding settings updated successfully"
                })
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred",
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-8 max-w-4xl">
            {/* Visual Identity Section */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-primary" />
                        <CardTitle>Visual Identity</CardTitle>
                    </div>
                    <CardDescription>
                        Customize how your storefront looks to visitors.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Cover Image */}
                    <div className="space-y-2">
                        <Label>Cover Image</Label>
                        <div className="border-2 border-dashed rounded-lg p-4 hover:bg-muted/50 transition-colors">
                            {formData.cover_image_url ? (
                                <div className="relative w-full h-48 rounded-md overflow-hidden group">
                                    <Image
                                        src={formData.cover_image_url}
                                        alt="Cover"
                                        fill
                                        className="object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => coverInputRef.current?.click()}
                                        >
                                            Change Cover
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                                    <ImageIcon className="h-10 w-10 mb-2" />
                                    <p>Upload a cover image (1920x400 recommended)</p>
                                    <Button
                                        variant="outline"
                                        className="mt-4"
                                        onClick={() => coverInputRef.current?.click()}
                                        disabled={isUploadingCover}
                                    >
                                        {isUploadingCover && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Select Image
                                    </Button>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={coverInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => handleFileUpload(e, 'cover')}
                            />
                        </div>
                    </div>

                    <Separator />

                    {/* Colors */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Palette className="h-4 w-4 text-muted-foreground" />
                            <Label>Brand Colors</Label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="primary" className="text-xs text-muted-foreground">Primary Color</Label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        id="primary"
                                        value={formData.colors.primary}
                                        onChange={(e) => handleColorChange('primary', e.target.value)}
                                        className="h-10 w-10 rounded-md cursor-pointer border p-1"
                                    />
                                    <Input
                                        value={formData.colors.primary}
                                        onChange={(e) => handleColorChange('primary', e.target.value)}
                                        className="font-mono"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="secondary" className="text-xs text-muted-foreground">Secondary Color</Label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        id="secondary"
                                        value={formData.colors.secondary}
                                        onChange={(e) => handleColorChange('secondary', e.target.value)}
                                        className="h-10 w-10 rounded-md cursor-pointer border p-1"
                                    />
                                    <Input
                                        value={formData.colors.secondary}
                                        onChange={(e) => handleColorChange('secondary', e.target.value)}
                                        className="font-mono"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="accent" className="text-xs text-muted-foreground">Accent Color</Label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        id="accent"
                                        value={formData.colors.accent}
                                        onChange={(e) => handleColorChange('accent', e.target.value)}
                                        className="h-10 w-10 rounded-md cursor-pointer border p-1"
                                    />
                                    <Input
                                        value={formData.colors.accent}
                                        onChange={(e) => handleColorChange('accent', e.target.value)}
                                        className="font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Profile Information */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-primary" />
                        <CardTitle>Profile Details</CardTitle>
                    </div>
                    <CardDescription>
                        Tell visitors about your venue or organization.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-2">
                        <Label htmlFor="tagline">Tagline</Label>
                        <Input
                            id="tagline"
                            placeholder="e.g. Seattle's Premier Jazz Venue"
                            value={formData.tagline}
                            onChange={(e) => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="bio">Bio</Label>
                        <Textarea
                            id="bio"
                            placeholder="Tell your story..."
                            className="min-h-[120px]"
                            value={formData.bio}
                            onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Social & Contact */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Facebook className="h-5 w-5 text-primary" />
                        <CardTitle>Social & Contact</CardTitle>
                    </div>
                    <CardDescription>
                        Connect with your audience.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Instagram</Label>
                            <div className="relative">
                                <Instagram className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    placeholder="@username"
                                    value={formData.social_links.instagram}
                                    onChange={(e) => handleSocialChange('instagram', e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Facebook</Label>
                            <div className="relative">
                                <Facebook className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    placeholder="Page URL"
                                    value={formData.social_links.facebook}
                                    onChange={(e) => handleSocialChange('facebook', e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Website</Label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    placeholder="https://..."
                                    value={formData.social_links.website}
                                    onChange={(e) => handleSocialChange('website', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                        <Label>Contact Visibility</Label>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium">Show Email Address</p>
                                    <p className="text-xs text-muted-foreground">Display email on your profile</p>
                                </div>
                            </div>
                            <Switch
                                checked={formData.contact_display.email}
                                onCheckedChange={(checked) =>
                                    setFormData(prev => ({
                                        ...prev,
                                        contact_display: { ...prev.contact_display, email: checked }
                                    }))
                                }
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium">Show Phone Number</p>
                                    <p className="text-xs text-muted-foreground">Display phone on your profile</p>
                                </div>
                            </div>
                            <Switch
                                checked={formData.contact_display.phone}
                                onCheckedChange={(checked) =>
                                    setFormData(prev => ({
                                        ...prev,
                                        contact_display: { ...prev.contact_display, phone: checked }
                                    }))
                                }
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pb-8">
                <Button size="lg" onClick={handleSubmit} disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Branding Settings
                </Button>
            </div>
        </div>
    )
}
