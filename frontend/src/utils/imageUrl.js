export const API_ROOT = (
  import.meta.env.VITE_API_ROOT ||
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/api\/?$/, "").replace(/\/+$/, "");

/**
 * Normalizes relative image paths to full URLs or passes absolute/data/blob URIs through.
 * Automatically rewrites localhost/127.0.0.1 URLs to API_ROOT so live HTTPS production
 * doesn't get blocked by mixed content / local network restrictions.
 */
export function getImageUrl(url) {
  if (!url) return "";

  let value = String(url).trim();
  if (!value) return "";

  // If the stored URL points to localhost or 127.0.0.1 (common when uploads happened locally),
  // extract the pathname so it is served from API_ROOT instead
  if (
    value.startsWith("http://localhost") ||
    value.startsWith("http://127.0.0.1") ||
    value.startsWith("https://localhost") ||
    value.startsWith("https://127.0.0.1")
  ) {
    try {
      const parsed = new URL(value);
      value = `${parsed.pathname}${parsed.search}`;
    } catch {
      value = value.replace(/^https?:\/\/[^/]+/, "");
    }
  }

  // If on an HTTPS page and an http:// URL is on our domain or subdomains, upgrade to https
  if (typeof window !== "undefined" && window.location.protocol === "https:" && value.startsWith("http://")) {
    try {
      const parsed = new URL(value);
      if (parsed.hostname.includes("sportzmitrastore.com") || parsed.hostname === window.location.hostname) {
        value = `https://${parsed.host}${parsed.pathname}${parsed.search}`;
      }
    } catch {}
  }

  // Support absolute URLs, base64 data URIs, and local blob preview URLs
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  // Ensure relative path starts with a single leading slash
  const cleanPath = value.startsWith("/") ? value : `/${value}`;

  return `${API_ROOT}${cleanPath}`;
}