/**
 * Property-family metadata — client-safe (no DB imports), shared by the
 * grouped Site pages index, the /facts/<family> sheet, the /building/<family>
 * per-property manual sheet, the Quick updates view, and the server-side
 * guest-page store (which re-exports it).
 *
 * Two property lists per family:
 * - `properties`  — the units that have a `*-config` CMS row (per-property
 *   facts: WiFi, door codes, unit number). Drives the facts sheet. The lead
 *   unit (gk) has no config row, so it is absent here.
 * - `manualProperties` — every unit in the building (lead included). Each has
 *   a per-property manual OVERRIDE document `<slug>-manual` in every language,
 *   merged over the shared building manual at render. Drives the building sheet.
 */

export type PageFamilyId = "gk" | "ht";

export type PageFamily = {
  id: PageFamilyId;
  label: string;
  // Short building nickname used in headers ("Kelly Building", "Haebangchon").
  shortLabel: string;
  manualPage: string;
  properties: { page: string; label: string; path: string }[];
  manualProperties: { slug: string; label: string; path: string }[];
};

export const PAGE_FAMILIES: PageFamily[] = [
  {
    id: "gk",
    label: "Kelly Building — GK · Ananda · Prana",
    shortLabel: "Kelly Building",
    manualPage: "manuals",
    properties: [
      { page: "gka-config", label: "Ananda", path: "/gka" },
      { page: "gkb-config", label: "Prana", path: "/gkb" },
    ],
    manualProperties: [
      { slug: "gk", label: "Kelly (GK)", path: "/gk" },
      { slug: "gka", label: "Ananda", path: "/gka" },
      { slug: "gkb", label: "Prana", path: "/gkb" },
    ],
  },
  {
    id: "ht",
    label: "Haebangchon — HT · HTA · HTB",
    shortLabel: "Haebangchon",
    manualPage: "manuals-ht",
    properties: [
      { page: "ht-config", label: "COZE HT", path: "/ht" },
      { page: "hta-config", label: "HTA", path: "/hta" },
      { page: "htb-config", label: "HTB", path: "/htb" },
    ],
    manualProperties: [
      { slug: "ht", label: "COZE HT", path: "/ht" },
      { slug: "hta", label: "HTA", path: "/hta" },
      { slug: "htb", label: "HTB", path: "/htb" },
    ],
  },
];

export const getFamily = (id: string) => PAGE_FAMILIES.find((f) => f.id === id);

export const getFamilyForPage = (page: string) =>
  PAGE_FAMILIES.find(
    (f) => f.manualPage === page || f.properties.some((p) => p.page === page),
  );

// The per-property manual override page id for a property slug.
export const overridePageFor = (slug: string) => `${slug}-manual`;

// Maps a per-property manual override page (`<slug>-manual`) to the shared
// building manual it overrides ("manuals" / "manuals-ht"), or null when the
// page is not an override page. Used server-side to validate an override save
// against the shared manual's shape.
export const sharedManualForOverride = (page: string): string | null => {
  const match = /^(.+)-manual$/.exec(page);
  if (!match) return null;
  const slug = match[1];
  const family = PAGE_FAMILIES.find((f) =>
    f.manualProperties.some((p) => p.slug === slug),
  );
  return family?.manualPage ?? null;
};
