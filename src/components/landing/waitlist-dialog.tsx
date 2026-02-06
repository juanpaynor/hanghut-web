"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";

interface WaitlistDialogProps {
    children: React.ReactNode;
}

export function WaitlistDialog({ children }: WaitlistDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        setLoading(false);
        setOpen(false);
        toast({
            title: "You're on the list! 🚀",
            description: "We'll let you know as soon as HangHut is ready for your crowd.",
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-[32px] border-0 shadow-2xl">
                <DialogHeader className="space-y-4 pt-4">
                    <div className="mx-auto p-3 rounded-2xl bg-primary/10 w-fit">
                        <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                    </div>
                    <DialogTitle className="text-3xl font-headline font-bold text-center tracking-tighter">
                        Find Your Crowd
                    </DialogTitle>
                    <DialogDescription className="text-center text-lg font-light leading-relaxed">
                        Join the waitlist to discover shared experiences and build your intentional community.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-4 pb-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">Full Name</Label>
                        <Input
                            id="name"
                            placeholder="John Doe"
                            required
                            className="rounded-2xl border-slate-200 bg-slate-50 h-12 focus-visible:ring-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="john@example.com"
                            required
                            className="rounded-2xl border-slate-200 bg-slate-50 h-12 focus-visible:ring-primary"
                        />
                    </div>
                    <Button
                        type="submit"
                        className="w-full h-14 rounded-full text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Join Waitlist"
                        )}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
