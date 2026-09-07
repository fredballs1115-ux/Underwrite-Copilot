import { redirect } from "next/navigation";

/**
 * Submarkets no longer have a section of their own: the list and the create
 * form are the "Your submarkets" panel on Market data. This route stays so
 * bookmarks, the deal page's links and the action redirects all land in the
 * right place — with any error code carried across so the panel can still
 * show it. The per-submarket pages at /submarkets/[id] are unchanged.
 */
export default async function SubmarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  redirect(
    error
      ? `/market?submarketError=${encodeURIComponent(error)}#submarkets`
      : "/market#submarkets",
  );
}
