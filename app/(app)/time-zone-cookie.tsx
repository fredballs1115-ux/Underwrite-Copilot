"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE, cookieValueOf, tzCookieUpdate } from "@/lib/reader-day";

/**
 * Writes the reader's time zone to a cookie (lib/reader-day `TZ_COOKIE`), so
 * the server counts "today" and every "due in Nd" from the reader's own
 * calendar day. Draws nothing. Written where the cookie is absent or names
 * another zone; and where the day the server rendered with is not the
 * reader's (a first visit after 8 pm Eastern from the West Coast, say), the
 * page is asked for again so its dates are the reader's at once. The
 * server's markup and the first render always agree: the day is a prop the
 * page reads from the cookie, never read here.
 */
export function TimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    let dayMoves = false;
    try {
      const write = tzCookieUpdate(
        cookieValueOf(document.cookie, TZ_COOKIE),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        { secure: window.location.protocol === "https:" },
      );
      if (!write) return;
      document.cookie = write.cookie;
      // A browser that keeps no cookies keeps the server's day: asking again
      // would only draw the same page.
      dayMoves = write.dayMoves && cookieValueOf(document.cookie, TZ_COOKIE) === write.value;
    } catch {
      // cookies or Intl unavailable — the server keeps its default day
      return;
    }
    if (dayMoves) router.refresh();
  }, [router]);
  return null;
}
