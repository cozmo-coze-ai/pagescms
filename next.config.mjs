/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next traces Node's empty pg-cloudflare entry; OpenNext needs its Workerd
  // socket implementation when bundling the same database driver for Workers.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pg-cloudflare/**/*"],
  },
  env: {
    // Expose the Supabase project URL to the client bundle so
    // lib/media-path.ts can build public Storage URLs for thumbnails and the
    // rich-text editor — reuses SUPABASE_URL, no separate env var to manage.
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  },
};

export default nextConfig;
