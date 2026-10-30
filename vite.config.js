import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Fills in the absolute site URL (canonical, og:url, og:image) and emits
// robots.txt + sitemap.xml at build time. Search engines need absolute URLs,
// which depend on where the site is deployed, so they come from VITE_SITE_URL.
function seoFiles(siteUrl, googleVerification) {
  return {
    name: "seo-files",
    transformIndexHtml(html) {
      let out = html.replaceAll("__SITE_URL__", siteUrl);
      if (googleVerification) {
        out = out.replace("</head>", `  <meta name="google-site-verification" content="${googleVerification}">\n</head>`);
      }
      return out;
    },
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source:
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          `  <url>\n    <loc>${siteUrl}</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n` +
          `</urlset>\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = (env.VITE_SITE_URL || "http://localhost:5173/").replace(/\/?$/, "/");
  return {
    // Relative asset paths work for both user pages and project pages on GitHub Pages
    base: "./",
    plugins: [react(), seoFiles(siteUrl, env.VITE_GOOGLE_SITE_VERIFICATION)],
    // heic2any (~1.3MB) is already a lazy chunk that only loads for HEIC files
    build: { chunkSizeWarningLimit: 1500 },
    test: { environment: "node", include: ["src/**/*.test.{js,jsx}"] },
  };
});
