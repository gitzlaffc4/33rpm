import { ExternalLink } from "lucide-react";

import { APP_COMMIT, APP_COMMIT_SHORT, APP_VERSION, REPO_URL } from "@/lib/version";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono">{children}</dd>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** Static build info: version (package.json), commit, and project links. */
export function AboutSection() {
  return (
    <div className="space-y-4">
      <dl className="divide-y">
        <Row label="Version">{APP_VERSION}</Row>
        <Row label="Commit">
          {APP_COMMIT && APP_COMMIT_SHORT ? (
            <ExtLink href={`${REPO_URL}/commit/${APP_COMMIT}`}>{APP_COMMIT_SHORT}</ExtLink>
          ) : (
            "unknown"
          )}
        </Row>
      </dl>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <ExtLink href={`${REPO_URL}/blob/main/CHANGELOG.md`}>Changelog</ExtLink>
        <ExtLink href={REPO_URL}>Source code</ExtLink>
        <ExtLink href={`${REPO_URL}/security/advisories/new`}>Report a security issue</ExtLink>
      </div>
    </div>
  );
}
