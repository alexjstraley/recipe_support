// Use the same policy in development and the deployment artifact.
module.exports = {
  "Content-Security-Policy": [
    "default-src 'none'", "script-src 'self'", "style-src 'self'",
    "img-src 'self' https://images.unsplash.com", "font-src 'self'",
    // HTTPS recipe imports use CORS; no authenticated cookies or referrers are sent.
    "connect-src 'self' https:", "object-src 'none'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'", "frame-src 'none'"
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cache-Control": "no-store"
};
