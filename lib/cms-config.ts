/**
 * Static content schema for the Supabase-native CMS.
 *
 * Replaces the old GitHub-era ".pages.yml" (fetched/cached per-repo) with a
 * fixed, hardcoded config — there's only ever one "site" here, so a
 * user-editable multi-repo YAML schema is unnecessary complexity. Shaped
 * exactly like the old parsed-config object (`{ content: [...], media: [...] }`)
 * so `fields/registry.ts`'s schema/read/write functions and `lib/schema.ts`'s
 * `deepMap` / `generateZodSchema` / `getSchemaByName` keep working unmodified.
 *
 * Media paths use two conventions (see lib/media-path.ts):
 * - `cover` (image field, `media: false`): bucket keys (`<slug>/<file>`),
 *   stored untouched.
 * - Inline body images (rich-text): site paths (`/itineraries/<slug>/<file>`,
 *   the media entry's `output`), matching what coze_client serves after
 *   materializing the bucket into `public/itineraries/`. The editor swaps
 *   these through the `input` space to public Storage URLs for display.
 */

const cmsConfig = {
  content: [
    {
      name: "itineraries",
      label: "Itineraries",
      type: "collection",
      fields: [
        {
          name: "title",
          label: "Title",
          type: "string",
          required: true,
          description: "Shown on the itinerary card and page heading.",
        },
        {
          name: "slug",
          label: "URL slug",
          type: "string",
          required: true,
          pattern: {
            regex: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
            message: "Lowercase letters, numbers and hyphens only (e.g. seoul-heritage-tour).",
          },
          description:
            "Part of the page address: coze.care/itineraries/<slug>. Don't change it after publishing — the old link would break.",
        },
        {
          name: "category",
          label: "Category",
          type: "select",
          required: true,
          options: {
            values: [
              { value: "tour", label: "Destination-led tour" },
              { value: "experience", label: "Hands-on local moment" },
            ],
          },
        },
        {
          name: "tag",
          label: "Badge",
          type: "select",
          description: "Small badge shown on the itinerary card.",
          options: {
            values: ["Popular", "Always", "Seasonal", "Closed", "Unique", "Coze Original", "Completed"],
          },
        },
        {
          name: "tagColor",
          label: "Badge color",
          type: "select",
          options: {
            values: ["red", "blue", "purple", "green", "yellow", "orange", "pink", "gray"],
          },
        },
        {
          // `media: false`: cover values are bucket keys (`<slug>/<file>`)
          // stored as-is — no input/output prefix swap (and no "must start
          // with the media root" validation), unlike inline body images
          // which use the media config below.
          name: "cover",
          label: "Cover photo",
          type: "image",
          options: { media: false },
          description: "Shown on the itinerary card and page header.",
        },
        {
          name: "published",
          label: "Published",
          type: "boolean",
          default: true,
          description: "Turn off to hide this itinerary from the website.",
        },
        {
          name: "body",
          label: "Content",
          type: "rich-text",
          description: "The full itinerary page. Use headings, photos and lists like in Notion.",
        },
      ],
    },
    {
      name: "homepage",
      label: "Homepage",
      type: "file",
      fields: [
        { name: "title", label: "Title", type: "string", required: true },
        { name: "description", label: "Description", type: "text" },
      ],
    },
  ],
  media: [
    {
      name: "itineraries",
      label: "Photos",
      input: "itineraries",
      output: "/itineraries",
    },
  ] as Array<Record<string, any>>,
};

export { cmsConfig };
