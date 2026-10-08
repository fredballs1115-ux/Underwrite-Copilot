import { OSM_COPYRIGHT_URL } from "@/lib/basemaps";

/**
 * The credit under the address search's suggestions. They are Photon's
 * (photon.komoot.io), a geocoder on OpenStreetMap's data, and OpenStreetMap's
 * attribution guideline asks an application that incorporates such a
 * geocoder to credit OpenStreetMap, the text "OpenStreetMap" a link to its
 * copyright page, which says the data is under the Open Database License
 * (lib/basemaps, where the guideline's printed words are quoted).
 *
 * Pure, so a test renders it; the suggestions list is open only while the
 * reader types, which a server render never is.
 */
export function AddressSearchCredit({ className }: { className?: string }) {
  return (
    <p className={className} data-qa="osm-credit">
      Address search ©{" "}
      <a
        href={OSM_COPYRIGHT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        OpenStreetMap
      </a>{" "}
      contributors
    </p>
  );
}
