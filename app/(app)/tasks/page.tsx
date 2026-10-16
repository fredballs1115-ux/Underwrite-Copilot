import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { TZ_COOKIE, readerToday } from "@/lib/reader-day";
import { MY_TASKS_MAX, myTaskRowsOf, type MyTaskDbRow } from "@/lib/my-tasks";
import { MyTasksView } from "./my-tasks-view";

export const metadata: Metadata = { title: "My tasks" };

/**
 * "My tasks" (lib/my-tasks): the open tasks assigned to the reader across
 * every deal they can read. One query: the reader's open tasks with each
 * deal's name embedded, row-level security handing over only the tasks of
 * deals the reader can read (0022's `can_access_deal`), soonest first,
 * bounded at MY_TASKS_MAX. Grouped on the reader's own day.
 */
export default async function MyTasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/tasks");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deal_tasks")
    .select("id, title, due_date, created_at, source, deal_id, deals!inner(name)")
    .eq("assignee_user_id", user.id)
    .eq("done", false)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    // One past the bound, so a list the bound cut says so.
    .limit(MY_TASKS_MAX + 1);
  if (error) {
    throw new Error(`Couldn't load your tasks: ${error.message}`);
  }
  const rows = myTaskRowsOf((data ?? []) as unknown as MyTaskDbRow[]);
  const capped = rows.length > MY_TASKS_MAX;
  const todayIso = readerToday((await cookies()).get(TZ_COOKIE)?.value);

  // The shell draws the page's <main> and its reading width.
  return <MyTasksView tasks={capped ? rows.slice(0, MY_TASKS_MAX) : rows} todayIso={todayIso} capped={capped} />;
}
