import { PublicShell } from "@/app/public-shell";

/** /tools opens for a prospect as well as for a signed-in analyst — the
 *  arithmetic is the same either way, and a calculator behind a login is a
 *  calculator nobody reaches for. Same two front doors as /market. */
export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
