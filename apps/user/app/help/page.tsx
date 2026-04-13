export default function HelpPage() {
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Help</h1>
      <div className="mt-4 space-y-3 text-sm text-slate-700">
        <p>
          <span className="font-medium">FAQ:</span> Contact staff via the LINE Official Account chat for support.
        </p>
        <p>
          <a
            className="text-emerald-700 underline"
            href="https://line.me/R/ti/p/@your-line-id"
            target="_blank"
            rel="noreferrer"
          >
            Open LINE chat
          </a>
        </p>
        <p className="text-xs text-slate-500">Replace the link with your channel&apos;s add-friend / chat URL.</p>
      </div>
    </main>
  );
}
