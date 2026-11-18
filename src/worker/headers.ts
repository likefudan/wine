/**
 * What the browser may load and do on this site. Same list as public/_headers, which covers files
 * served without the Worker; this covers every page and answer the Worker makes (/l/:id, /api/...).
 * Styles allow inline (Preact `style=` props); images allow Google avatars and photos made on the
 * phone (data:/blob:); fetch allows data: (the share card reads a photo it already holds).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(self), microphone=()",
};
