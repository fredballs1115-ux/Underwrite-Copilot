import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/app/logo";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  confirmPageCopy,
  confirmSwitchCopy,
  emailLinkTypeOf,
  isTokenHash,
  safeNextPath,
  type EmailLinkType,
} from "@/lib/auth-flow";
import { confirmEmailLink, signOutHere } from "./actions";

// The page an email link lands on, with its token hash: one button, and the
// link is verified only when it is pressed (lib/auth-flow EMAIL_LINK_TYPES).
// It never verifies anything itself. Two more states, each read off its own
// query (research pass 39): `switch=1`, where the press found an account
// signed in to this browser and the page asks before replacing it; and
// `signed_in=1`, where a verified link lands, naming the account now signed
// in. Nothing here is for a search engine.
export const metadata: Metadata = { title: "Confirm", robots: { index: false, follow: false } };

const BUTTON =
  "w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong";
const TEXT_LINK = "font-medium text-brand underline-offset-2 hover:underline";

/** The email of the account signed in to this browser, or null where none
 *  is or the session cannot be read. */
async function signedInEmail(): Promise<string | null> {
  try {
    return (await getCurrentUser())?.email ?? null;
  } catch {
    return null;
  }
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string; switch?: string; signed_in?: string }>;
}) {
  const params = await searchParams;
  const type = emailLinkTypeOf(params.type);
  const tokenHash = params.token_hash ?? "";
  const usable = type !== null && isTokenHash(tokenHash);
  const signedInState = params.signed_in === "1";
  const asking = !signedInState && usable && params.switch === "1";
  // Who is signed in is read only where the page names them.
  const email = signedInState || asking ? await signedInEmail() : null;
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="flex items-center justify-center gap-2.5 transition-opacity hover:opacity-80">
        <LogoMark className="h-8 w-8" />
        <span className="font-semibold tracking-tight">Underwrite Copilot</span>
      </Link>
      <section className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card">
        {signedInState ? (
          <SignedIn email={email} onward={safeNextPath(params.next ?? null) ?? "/deals"} />
        ) : usable && type ? (
          <Verify type={type} tokenHash={tokenHash} next={params.next ?? null} asking={asking} email={email} />
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight">This link is incomplete</h1>
            <p className="mt-2 text-sm text-muted">
              It may have been cut short when it was copied.{" "}
              <Link href="/login?link=expired" className={TEXT_LINK}>
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

/** Where a verified link lands: who is signed in now, and the way on. */
function SignedIn({ email, onward }: { email: string | null; onward: string }) {
  if (!email) {
    return (
      <>
        <h1 className="text-lg font-semibold tracking-tight">You&rsquo;re not signed in</h1>
        <p className="mt-2 text-sm text-muted">
          <Link href="/login" className={TEXT_LINK}>
            Sign in
          </Link>{" "}
          to carry on.
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">Signed in</h1>
      <div data-qa="signed-in-as" className="mt-2 text-sm text-muted [overflow-wrap:anywhere]">
        Signed in as <strong className="font-semibold text-ink">{email}</strong> — not you?{" "}
        <form action={signOutHere} className="inline">
          <button type="submit" className={TEXT_LINK}>
            Sign out
          </button>
        </form>
      </div>
      <Link href={onward} className={`mt-5 block text-center ${BUTTON}`}>
        Continue
      </Link>
    </>
  );
}

/** The link's own page: its one button, or — once a press found an account
 *  signed in here — the question before replacing it. */
function Verify({
  type,
  tokenHash,
  next,
  asking,
  email,
}: {
  type: EmailLinkType;
  tokenHash: string;
  next: string | null;
  asking: boolean;
  email: string | null;
}) {
  const copy: { heading: string; body: string; button: string; stay?: string } = asking
    ? confirmSwitchCopy(type, email)
    : confirmPageCopy(type);
  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">{copy.heading}</h1>
      <p className="mt-2 text-sm text-muted [overflow-wrap:anywhere]">{copy.body}</p>
      <form action={confirmEmailLink} className="mt-5">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {asking ? <input type="hidden" name="replace" value="1" /> : null}
        <button type="submit" className={BUTTON}>
          {copy.button}
        </button>
      </form>
      {copy.stay ? (
        <p className="mt-3 text-center text-sm">
          <Link href="/deals" className={TEXT_LINK}>
            {copy.stay}
          </Link>
        </p>
      ) : null}
    </>
  );
}
