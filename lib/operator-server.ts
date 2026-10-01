import "server-only";
import { isOperator, type OperatorCandidate } from "./operator";

/** Whether the signed-in user is one of the site's operators, by the
 *  server's OPERATOR_EMAILS (lib/operator). Never `NEXT_PUBLIC_`: the list
 *  of addresses stays on the server. */
export function isSiteOperator(user: OperatorCandidate | null | undefined): boolean {
  return isOperator(user, process.env.OPERATOR_EMAILS);
}
