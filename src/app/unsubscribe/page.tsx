import { processUnsubscribe } from "@/lib/marketing/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { MailX, CheckCircle, AlertCircle } from "lucide-react"

interface VerifyUnsubscribePageProps {
    searchParams: Promise<{
        token?: string
    }>
}

export default async function UnsubscribePage({ searchParams }: VerifyUnsubscribePageProps) {
    const { token } = await searchParams

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 bg-red-100 p-3 rounded-full w-fit">
                            <AlertCircle className="w-6 h-6 text-red-600" />
                        </div>
                        <CardTitle>Invalid Link</CardTitle>
                        <CardDescription>
                            This unsubscribe link is missing a valid token.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="justify-center">
                        <Button asChild variant="default">
                            <Link href="/">Return to Home</Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    const result = await processUnsubscribe(token)

    return (
        <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className={`mx-auto mb-4 p-3 rounded-full w-fit ${result.success ? 'bg-green-100' : 'bg-red-100'}`}>
                        {result.success ? (
                            <MailX className="w-6 h-6 text-green-600" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-red-600" />
                        )}
                    </div>
                    <CardTitle>{result.success ? "Unsubscribed" : "Error"}</CardTitle>
                    <CardDescription>
                        {result.success
                            ? `You have been removed from the mailing list for ${result.organizer}.`
                            : "We encountered an issue processing your request."
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center text-sm text-muted-foreground">
                    {result.message}
                </CardContent>
                <CardFooter className="justify-center flex-col gap-2">
                    <Button asChild variant="outline" className="w-full">
                        <Link href="/">Return Home</Link>
                    </Button>
                    {result.success && result.email && (
                        <p className="text-xs text-muted-foreground mt-4">
                            Unsubscribed: {result.email}
                        </p>
                    )}
                </CardFooter>
            </Card>
        </div>
    )
}
