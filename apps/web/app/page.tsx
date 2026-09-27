import Link from "next/link";
import { Forge } from "@/components/Forge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/Toast";

export default function Home() {
  return (
    <ToastProvider>
      <main className="mx-auto max-w-[1080px]">
        <header className="mb-8 border-b border-line pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow text-accent">Palette Forge</p>
            <nav className="flex items-center gap-4 font-mono text-[11px] text-muted">
              <Link href="/docs" className="hover:text-accent">
                Docs
              </Link>
              <a
                href="https://www.npmjs.com/package/palette-forge"
                className="hover:text-accent"
                target="_blank"
                rel="noreferrer"
              >
                npm
              </a>
              <a
                href="https://github.com/KodeSage/palette-forge"
                className="hover:text-accent"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <ThemeToggle />
            </nav>
          </div>

          <h1 className="mt-2.5 text-[clamp(26px,4vw,38px)] font-semibold leading-[1.1] tracking-[-0.025em]">
            Extract a brand palette. Generate the tokens.
          </h1>
          <p className="mt-2.5 max-w-[62ch] text-sm text-muted">
            Drop in a logo or a screenshot, or paste a website link. Palette Forge finds the main colours, works out
            which one is your brand colour and which is your text colour, checks that they
            can be read together, and writes the CSS for you.
          </p>
          <p className="mt-2 max-w-[62ch] text-[13px] text-faint">
            New to this? There is a{" "}
            <Link href="/docs#start" className="text-muted underline underline-offset-2 hover:text-accent">
              plain-English guide
            </Link>{" "}
            with no jargon in it. Two minutes.
          </p>
          <p className="mt-3 font-mono text-[11px] text-faint">
            Images never leave your browser. Website links are fetched by the server, which
            only reads the page&rsquo;s public HTML and CSS.
          </p>
        </header>

        <Forge />

        <footer className="mt-20 border-t border-line pt-6 font-mono text-[11px] leading-relaxed text-faint">
          <p>
            Same engine as the{" "}
            <code className="text-muted">palette-forge</code> npm package. Run it with{" "}
            <code className="text-muted">npx palette-forge logo.png</code>
          </p>
          <p className="mt-1.5">
            MIT licensed. <Link href="/docs" className="hover:text-accent">Read the docs →</Link>
          </p>
        </footer>
      </main>
    </ToastProvider>
  );
}
