// Neutral brand mark inlined as a data URI so the single-file build stays self-contained.
export const INLINE_LOGO_JPEG =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#38bdf8"/>' +
      '<stop offset="1" stop-color="#6366f1"/>' +
      '</linearGradient></defs>' +
      '<rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)"/>' +
      '<circle cx="32" cy="32" r="11" fill="none" stroke="#ffffff" stroke-width="4"/>' +
      '<circle cx="32" cy="32" r="3" fill="#ffffff"/>' +
      '</svg>',
  );
