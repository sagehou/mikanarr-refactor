const { format } = require('node:url');

function freezePolicy(policy) {
  return Object.freeze({
    ...policy,
    exactHosts: Object.freeze([...policy.exactHosts]),
    parentDomains: Object.freeze([...policy.parentDomains])
  });
}

const MIKAN_POLICY = freezePolicy({
  exactHosts: ['mikanani.me'],
  parentDomains: [],
  maxRedirects: 3,
  maxBytes: 'maxXmlBytes'
});

const IMAGE_POLICY = freezePolicy({
  exactHosts: ['mikanani.me', 'artworks.thetvdb.com', 'image.tmdb.org', 'thetvdb.com'],
  parentDomains: ['mikanani.me', 'artworks.thetvdb.com', 'image.tmdb.org', 'thetvdb.com'],
  maxRedirects: 3,
  maxBytes: 'maxImageBytes'
});

function notAllowed() {
  const error = new Error('URL_NOT_ALLOWED');
  error.code = 'URL_NOT_ALLOWED';
  return error;
}

function parseAllowedUrl(raw, policy) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw notAllowed();
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = policy.exactHosts.includes(hostname) ||
    policy.parentDomains.some(domain => hostname.endsWith(`.${domain}`));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) {
    throw notAllowed();
  }
  return url;
}

function boundedAxiosOptions(policy, config) {
  const maxBytes = typeof policy.maxBytes === 'number'
    ? policy.maxBytes
    : config.http[policy.maxBytes];
  return {
    timeout: config.http.timeoutMs,
    maxRedirects: policy.maxRedirects,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    beforeRedirect(options) {
      parseAllowedUrl(options.href || format(options), policy);
    }
  };
}

module.exports = { MIKAN_POLICY, IMAGE_POLICY, parseAllowedUrl, boundedAxiosOptions };
