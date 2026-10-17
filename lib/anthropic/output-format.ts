/**
 * The structured-output format every Claude step sends (research pass 41).
 *
 * The SDK's `zodOutputFormat` parses the model's text while the response is
 * built and throws on an answer that does not parse — so the response, its
 * token meters and its stop reason are thrown away with the error: a cut-off
 * extraction's spend never reached the usage ledger, and the failure could
 * not tell a cut-off from a malformed answer. This is the SDK's format, its
 * `type` and `schema` untouched — so the request's bytes are the SDK's own,
 * and nothing before the cache breakpoint moves — with a parse that never
 * throws: an answer that does not parse comes back as a mark
 * (./failure `unparsedOutput`) in `parsed_output`, and ./failure's `structured` records
 * the meters before it names the failure.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { unparsedOutput } from "./failure";

export function screenOutputFormat<S extends Parameters<typeof zodOutputFormat>[0]>(schema: S): ReturnType<typeof zodOutputFormat<S>> {
  const format = zodOutputFormat(schema);
  return {
    ...format,
    parse: (content: string) => {
      try {
        return format.parse(content);
      } catch (err) {
        // Read by ./failure's `structured`, never by a caller: it throws on the mark.
        return unparsedOutput(err) as unknown as ReturnType<typeof format.parse>;
      }
    },
  };
}
