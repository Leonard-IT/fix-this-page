// Feedback as a link: the PCF document, compressed, in the address's fragment. Browsers never send the fragment to a
// server, so the feedback travels only inside the message the person chooses to send it in.

const FRAGMENT_PREFIX = '#fix=';
// A link lives on in chat histories, so it says how it was encoded; a later encoding gets a new marker
const ENCODING = Object.freeze({ DeflateRaw: '1' });
const COMPRESSION = 'deflate-raw';
// A link comes from anyone, and deflate can expand a short link into gigabytes; feedback is far below this
const MAX_DECODED_BYTES = 1024 * 1024;
// Above this, some chat apps and mail clients cut the link off; the overlay then offers the file instead
const COMFORTABLE_LINK_LENGTH = 8000;
const BASE64_CHUNK = 0x8000;

/** The link for `pageUrl` that carries `pcfDocument`. */
async function shareUrl(pageUrl, pcfDocument) {
  const url = new URL(pageUrl);
  url.hash = '';
  return url.href + FRAGMENT_PREFIX + ENCODING.DeflateRaw + await compress(JSON.stringify(pcfDocument));
}

/** Whether an address's fragment (`location.hash`) carries feedback. */
function hasSharedFeedback(hash) {
  return String(hash || '').startsWith(FRAGMENT_PREFIX);
}

/** The PCF document in an address's fragment. Throws when the link is cut off, damaged or not feedback. */
async function readSharedFeedback(hash) {
  if (!hasSharedFeedback(hash)) throw new Error('This link carries no feedback');
  const payload = hash.slice(FRAGMENT_PREFIX.length);
  if (payload[0] !== ENCODING.DeflateRaw) throw new Error('This link was made by a newer version of fixthis');
  try {
    return JSON.parse(await decompress(payload.slice(1)));
  } catch {
    throw new Error('This link is incomplete or damaged; ask for it again, or for the file');
  }
}

function isComfortableLength(link) {
  return link.length <= COMFORTABLE_LINK_LENGTH;
}

async function compress(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream(COMPRESSION));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function decompress(base64url) {
  const stream = new Blob([fromBase64Url(base64url)]).stream().pipeThrough(new DecompressionStream(COMPRESSION));
  return new TextDecoder().decode(await readAtMost(stream, MAX_DECODED_BYTES));
}

async function readAtMost(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    total += next.value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Too large');
    }
    chunks.push(next.value);
  }
  return joinBytes(chunks, total);
}

function joinBytes(chunks, total) {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// The URL-safe alphabet without padding, so chat apps do not break the link at a `+`, `/` or `=`
function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

module.exports = { shareUrl, hasSharedFeedback, readSharedFeedback, isComfortableLength };
