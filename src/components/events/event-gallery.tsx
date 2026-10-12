'use client'

import * as React from 'react'
import { useState } from 'react'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from '@/components/ui/carousel'
import { Card, CardContent } from '@/components/ui/card'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import {
    Dialog,
    DialogContent,
    DialogClose,
} from '@/components/ui/dialog'
import { X } from 'lucide-react'

interface EventGalleryProps {
    images: string[]
    title: string
    aspectRatio?: number
}

export function EventGallery({ images, title, aspectRatio = 3 / 4 }: EventGalleryProps) {
    const [selectedImage, setSelectedImage] = useState<string | null>(null)

    if (!images || images.length === 0) return null

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Event Gallery</h2>
            <Carousel
                opts={{
                    align: "center",
                    loop: true,
                }}
                className="w-full"
            >
                <CarouselContent className="-ml-2 md:-ml-4">
                    {images.map((image, index) => (
                        <CarouselItem key={index} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/3">
                            <div className="p-1">
                                <Card
                                    className="overflow-hidden border-0 shadow-md cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
                                    onClick={() => setSelectedImage(image)}
                                >
                                    <CardContent className="p-0">
                                        <AspectRatio ratio={aspectRatio}>
                                            <div className="relative w-full h-full overflow-hidden">
                                                {/* Blurred echo behind the contained
                                                    image, the same treatment the hero
                                                    poster uses. object-contain in a 3:4
                                                    frame letterboxes any landscape shot,
                                                    and those bars were painting the
                                                    Card's own background — which reads as
                                                    bright white slabs on a dark themed
                                                    page. Filling them with the image
                                                    itself makes the gap intentional on
                                                    every theme, without cropping. */}
                                                <img
                                                    src={image}
                                                    alt=""
                                                    aria-hidden
                                                    className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.55] saturate-150"
                                                />
                                                <img
                                                    src={image}
                                                    alt={`${title} - Image ${index + 1}`}
                                                    className="relative w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                            </div>
                                        </AspectRatio>
                                    </CardContent>
                                </Card>
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
                {images.length > 1 && (
                    <>
                        <CarouselPrevious />
                        <CarouselNext />
                    </>
                )}
            </Carousel>

            <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
                <DialogContent className="max-w-screen-xl w-full h-screen md:h-auto md:max-h-[90vh] p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center pointer-events-none">
                    <div className="relative w-full h-full flex items-center justify-center pointer-events-auto">
                        <DialogClose className="absolute top-4 right-4 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors">
                            <X className="h-6 w-6" />
                        </DialogClose>
                        {selectedImage && (
                            <img
                                src={selectedImage}
                                alt="Gallery Preview"
                                className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
