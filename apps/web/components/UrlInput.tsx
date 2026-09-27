"use client";

import { useState } from "react";
import { Button } from "./ui";

/** Sits where the dropzone does, at the same size, so switching modes doesn't jump. */
export function UrlInput({
  onSubmit,
  busy,
}: {
  onSubmit: (url: string) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      aria-busy={busy}
      className="rounded-[10px] border border-dashed border-line bg-surface px-6 py-8 text-center transition-colors duration-200 focus-within:border-solid focus-within:border-accent"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <label htmlFor="site-url" className="block text-[15px] font-medium">
        {busy ? "Reading the site's CSS…" : "Paste a website link"}
      </label>
      <div className="mx-auto mt-3.5 flex max-w-[560px] flex-wrap gap-2.5">
        <input
          id="site-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoFocus
          spellCheck={false}
          placeholder="https://stripe.com"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-0 flex-1 basis-56 rounded-[5px] border border-line bg-bg px-3 py-2 font-mono text-[13px] text-txt placeholder:text-faint hover:border-line-bright focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? "Reading…" : "Get colours"}
        </Button>
      </div>
      <div className="mt-2.5 font-mono text-[13px] text-muted">
        Reads the colours from the page&rsquo;s HTML and stylesheets
      </div>
    </form>
  );
}
