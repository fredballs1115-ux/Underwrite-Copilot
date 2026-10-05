import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/app/logo";
import { confirmPageCopy, emailLinkTypeOf, isTokenHash } from "@/lib/auth-flow";
import { confirmEmailLink } from "./actions";

// The page an email link lands on, with its token hash: one button, and the
// link is verified only when it is pressed (lib/auth-flow EMAIL_LINK_TYPES).
// Nothing here is for a search engine.
export const metadata: Metadata = { title: "Confirm", robots: { index: false, follow: false } };

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const params = await searchParams;
  const type = emailLinkTypeOf(params.type);
  const tokenHash = params.token_hash ?? "";
  const usable = type !== null && isTokenHash(tokenHash);
  const copy = type ? confirmPageCopy(type) : null;
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="flex items-center justify-center gap-2.5 transition-opacity hover:opacity-80">
        <LogoMark className="h-8 w-8" />
        <span className="font-semibold tracking-tight">Underwrite Copilot</span>
      </Link>
      <section className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card">
        {usable && copy ? (
          <>
            <h1 className="text-lg font-semibold tracking-tight">{copy.heading}</h1>
            <p className="mt-2 text-sm text-muted">{copy.body}</p>
            <form action={confirmEmailLink} className="mt-5">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              {params.next ? <input type="hidden" name="next" value={params.next} /> : null}
              <button
                type="submit"
                className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                {copy.button}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight">This link is incomplete</h1>
            <p className="mt-2 text-sm text-muted">
              It may have been cut short when it was copied.{" "}
              <Link href="/login?link=expired" className="font-medium text-brand underline-offset-2 hover:underline">
                Ask for a new one
              </Link>
              .
            </p>
          </>
        )}
      </section>
    </main>
  );
}
