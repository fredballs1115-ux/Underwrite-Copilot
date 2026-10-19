import { redirect } from "next/navigation";

/**
 * The cross-deal task list was retired (2026-10-19): a deal's tasks live on
 * its own page. An old link or bookmark lands on the pipeline.
 */
export default function TasksPage() {
  redirect("/deals");
}
