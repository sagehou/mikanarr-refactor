const safeRegex = require('safe-regex2');

const LIMITS = Object.freeze({
  remote: 2048,
  pattern: 1000,
  series: 200,
  season: 8,
  language: 100,
  quality: 100,
  releasegroup: 100
});

function text(input, field, { required = false, fallback = '' } = {}) {
  const value = input[field] === undefined || input[field] === null
    ? fallback
    : input[field];
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${field} is required`);
  if (normalized.length > LIMITS[field]) throw new Error(`${field} is too long`);
  return normalized;
}

function validateRemote(remote) {
  if (!remote) return;
  let url;
  try {
    url = new URL(remote);
  } catch {
    throw new Error('remote must be a valid Mikan URL');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'mikanani.me' ||
      url.username || url.password || url.port) {
    throw new Error('remote must be a valid Mikan URL');
  }
}

function hasNamedEpisodeGroup(source) {
  let inCharacterClass = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
    } else if (source[index] === '[') {
      inCharacterClass = true;
    } else if (source[index] === ']') {
      inCharacterClass = false;
    } else if (!inCharacterClass && source.startsWith('(?<episode>', index)) {
      return true;
    }
  }
  return false;
}

function validatePattern(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Pattern must be an object');
  }
  const remote = text(input, 'remote');
  const pattern = text(input, 'pattern', { required: true });
  const series = text(input, 'series', { required: true });
  const season = text(input, 'season', { required: true });
  const language = text(input, 'language', { fallback: 'Chinese' }) || 'Chinese';
  const quality = text(input, 'quality', { fallback: 'WEBDL 1080p' }) || 'WEBDL 1080p';
  const releasegroup = text(input, 'releasegroup');
  const offset = input.offset === undefined || input.offset === null ? 0 : input.offset;

  validateRemote(remote);
  let expression;
  try {
    expression = new RegExp(pattern);
  } catch {
    throw new Error('pattern must be a valid regular expression');
  }
  if (!hasNamedEpisodeGroup(expression.source)) {
    throw new Error('pattern must contain a named episode group');
  }
  if (!safeRegex(expression)) throw new Error('pattern is unsafe');
  if (!Number.isSafeInteger(offset) || offset < -100000 || offset > 100000) {
    throw new Error('offset must be an integer from -100000 to 100000');
  }

  return { remote, pattern, series, season, language, quality, offset, releasegroup };
}

function parsePositiveId(value) {
  if (!/^[0-9]+$/.test(String(value))) throw new Error('ID must be a positive integer');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('ID must be a positive integer');
  return id;
}

module.exports = { validatePattern, parsePositiveId, hasNamedEpisodeGroup };
