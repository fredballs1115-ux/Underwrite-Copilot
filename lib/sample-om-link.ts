// Where the sample deal's fictional offering memorandum is served
// (app/api/demo/om, built by lib/sample-om). No imports, so a client
// component — /demo's sections, the homepage's walkthrough — can link a page
// chip to it without loading the PDF writer or the sample fixture.

/** Raised whenever the PDF's content changes, so a browser holding the old
 *  file (served immutable under its version) asks for the new one. */
export const SAMPLE_OM_VERSION = "1";

/** The sha256 of the file SAMPLE_OM_VERSION names (lib/sample-om
 *  `renderSampleOm`, the same bytes every build). The URL is cached for a
 *  year, so lib/sample-om.test.ts fails the moment the bytes change: raise
 *  the version and write the new hash here, together. */
export const SAMPLE_OM_SHA256 = "0caf9d951fb9a673a3424cd9390e28ff97a5a05d50ded3e2d17d180a7ef9854b";

/** The route's path. */
export const SAMPLE_OM_PATH = "/api/demo/om";

/** The link every public page chip opens, a page riding as `#page=N`. */
export const SAMPLE_OM_HREF = `${SAMPLE_OM_PATH}?v=${SAMPLE_OM_VERSION}`;

/** The words stamped across every page of the file. */
export const SAMPLE_OM_STAMP = "FICTIONAL — ILLUSTRATIVE SAMPLE, NOT A REAL PROPERTY";
