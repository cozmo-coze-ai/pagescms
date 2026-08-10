/**
 * Property-family metadata — client-safe (no DB imports), shared by the
 * grouped Site pages index, the /facts/<family> sheet, the Quick updates
 * view and the server-side guest-page store (which re-exports it).
 *
 * Each family groups a shared manual page ("manuals" / "manuals-ht") with
 * the per-property facts (config) rows that fill in its blanks.
 */

export type PageFamilyId = "gk" | "ht";

export type PageFamily = {
  id: PageFamilyId;
  label: string;
  // Short building nickname used in headers ("Kelly Building", "Haebangchon").
  shortLabel: string;
  manualPage: string;
  properties: { page: string; label: string; path: string }[];
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
  },
];

export const getFamily = (id: string) => PAGE_FAMILIES.find((f) => f.id === id);

export const getFamilyForPage = (page: string) =>
  PAGE_FAMILIES.find(
    (f) => f.manualPage === page || f.properties.some((p) => p.page === page),
  );
