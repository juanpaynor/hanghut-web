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
import { createClient } from "@/lib/supabase/client";

interface WaitlistDialogProps {
    children: React.ReactNode;
}

export function WaitlistDialog({ children }: WaitlistDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [phoneType, setPhoneType] = useState<'android' | 'iphone' | null>(null);
    const { toast } = useToast();
    const supabase = createClient();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const fullName = formData.get("name") as string;
        const email = formData.get("email") as string;

        const { error } = await supabase
            .from('waitlist')
            .insert({ full_name: fullName, email, source: 'landing_page', phone_type: phoneType });

        setLoading(false);

        if (!error) {
            setOpen(false);
            setPhoneType(null);
            toast({
                title: "You're on the list! 🚀",
                description: "We'll let you know as soon as HangHut is ready for your crowd.",
            });
        } else {
            toast({
                title: "Heads up",
                description: error.code === '23505' ? "You're already on the waitlist!" : "Something went wrong. Please try again.",
                variant: "destructive",
            });
        }
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
                <form onSubmit={handleSubmit} className="space-y-5 pt-4 pb-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">Full Name</Label>
                        <Input
                            id="name"
                            name="name"
                            placeholder="John Doe"
                            required
                            className="rounded-2xl border-slate-200 bg-slate-50 h-12 focus-visible:ring-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="john@example.com"
                            required
                            className="rounded-2xl border-slate-200 bg-slate-50 h-12 focus-visible:ring-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">What phone do you use?</Label>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setPhoneType('android')}
                                className={`flex-1 h-11 rounded-2xl border-2 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                                    phoneType === 'android'
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-slate-200 text-muted-foreground hover:border-primary/50'
                                }`}
                            >
                                Android
                            </button>
                            <button
                                type="button"
                                onClick={() => setPhoneType('iphone')}
                                className={`flex-1 h-11 rounded-2xl border-2 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                                    phoneType === 'iphone'
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-slate-200 text-muted-foreground hover:border-primary/50'
                                }`}
                            >
                                iPhone
                            </button>
                        </div>
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
