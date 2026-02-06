'use client'

import * as React from 'react'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from '@/components/ui/carousel'
import { Card, CardContent } from '@/components/ui/card'
import { AspectRatio } from '@/components/ui/aspect-ratio'

interface EventGalleryProps {
    images: string[]
    title: string
}

export function EventGallery({ images, title }: EventGalleryProps) {
    if (!images || images.length === 0) return null

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold">Event Gallery</h2>
            <Carousel
                opts={{
                    align: "start",
                    loop: true,
                }}
                className="w-full"
            >
                <CarouselContent className="-ml-2 md:-ml-4">
                    {images.map((image, index) => (
                        <CarouselItem key={index} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/3">
                            <div className="p-1">
                                <Card className="overflow-hidden border-0 shadow-md">
                                    <CardContent className="p-0">
                                        <AspectRatio ratio={4 / 3}>
                                            <img
                                                src={image}
                                                alt={`${title} - Image ${index + 1}`}
                                                className="w-full h-full object-cover transition-transform hover:scale-105 duration-500"
                                            />
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
        </div>
    )
}
