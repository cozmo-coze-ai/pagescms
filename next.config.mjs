/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Expose the Supabase project URL to the client bundle so
    // lib/media-path.ts can build public Storage URLs for thumbnails and the
    // rich-text editor — reuses SUPABASE_URL, no separate env var to manage.
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  },
};

export default nextConfig;
