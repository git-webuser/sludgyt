const RAW_MANIFEST_PATTERNS = [
  /\.m3u8(\?|$)/i,
  /\.mpd(\?|$)/i,
  /[?&]expires=/i,
  /[?&]Policy=/i,
  /[?&]Signature=/i,
  /[?&]hdnts=/i,
];

function looksLikeRawManifest(url) {
  return RAW_MANIFEST_PATTERNS.some((re) => re.test(url));
}

module.exports = { looksLikeRawManifest };
