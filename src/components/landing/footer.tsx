export default function Footer() {
  return (
    <footer className="w-full py-6 md:px-8 md:py-8 border-t bg-background">
      <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} HangHut. All rights reserved.
        </p>
        <div className="flex gap-4">
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Terms of Service
          </a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Privacy Policy
          </a>
        </div>
      </div>
    </footer>
  );
}
