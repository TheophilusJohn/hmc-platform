const path = require('path');
const Minio = require('minio');

// ─── DEPLOYMENT NOTE ──────────────────────────────────────────────────────────
// The MinIO bucket policy historically granted public read on `arn:.../content/*`
// (see `ensureBucket` below — kept for backwards-compat with existing files).
// New uploads from this service are served via short-lived signed URLs instead,
// regardless of bucket policy. Once existing files are migrated (or the FE no
// longer needs to render the old public URLs), revoke public read with:
//     mc policy set none myminio/hmc-files
// and remove the `setBucketPolicy` call below.
// ──────────────────────────────────────────────────────────────────────────────

if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
  throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set — refusing to use minioadmin defaults');
}

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const DEFAULT_BUCKET = process.env.MINIO_BUCKET || 'hmc-files';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Reject MIME types that browsers will render as HTML/script.
const DENYLIST_MIME = new Set([
  'text/html', 'application/xhtml+xml', 'image/svg+xml',
  'application/x-msdownload', 'application/x-msdos-program',
  'application/x-sh', 'application/javascript', 'text/javascript',
  'application/x-php', 'text/x-php',
]);

const ALLOWLIST_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm',
  'text/plain', 'text/markdown', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
]);

function sanitizeObjectPath(input) {
  if (!input || typeof input !== 'string') throw new Error('objectPath required');
  // Normalize to forward-slashes, drop empty segments and traversal.
  const segments = input.replace(/\\/g, '/').split('/')
    .map(s => s.trim())
    .filter(s => s && s !== '.' && s !== '..');
  if (segments.length === 0) throw new Error('objectPath empty after sanitization');
  // Each segment: replace anything outside [A-Za-z0-9._-] with underscore.
  const cleaned = segments.map(s => s.replace(/[^A-Za-z0-9._-]/g, '_')).join('/');
  if (cleaned.length > 512) throw new Error('objectPath too long');
  return cleaned;
}

async function ensureBucket(bucketName = DEFAULT_BUCKET) {
  const exists = await client.bucketExists(bucketName);
  if (!exists) {
    await client.makeBucket(bucketName, 'us-east-1');
    // Bucket is created private. Files are served via short-lived signed URLs
    // through getReadUrl(). Do NOT auto-apply a public-read policy here — it
    // would silently expose every fresh-deploy bucket to the internet.
  }
}

/**
 * Upload a file buffer to MinIO with validation.
 * Returns the *object path* (key), NOT a URL. Callers should use getReadUrl to
 * mint short-lived signed URLs when serving the file.
 */
async function uploadFile(buffer, bucket = DEFAULT_BUCKET, objectPath, contentType = 'application/octet-stream') {
  if (!Buffer.isBuffer(buffer)) throw new Error('uploadFile: buffer required');
  if (buffer.length === 0) throw new Error('uploadFile: empty file');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`uploadFile: file exceeds ${MAX_UPLOAD_BYTES} byte cap`);
  }

  const ct = String(contentType).toLowerCase().split(';')[0].trim();
  if (DENYLIST_MIME.has(ct)) throw new Error(`uploadFile: content-type ${ct} not allowed`);
  if (!ALLOWLIST_MIME.has(ct)) throw new Error(`uploadFile: content-type ${ct} not in allowlist`);

  const safePath = sanitizeObjectPath(objectPath);
  await ensureBucket(bucket);
  await client.putObject(bucket, safePath, buffer, buffer.length, { 'Content-Type': ct });
  return safePath;
}

/**
 * Get a pre-signed URL for secure private access.
 */
async function getSignedUrl(objectPath, expirySeconds = 3600, bucket = DEFAULT_BUCKET) {
  return client.presignedGetObject(bucket, objectPath, expirySeconds);
}

/**
 * Resolve a stored reference to a readable URL.
 *  - If `stored` looks like a full URL (legacy public-bucket entries), return it.
 *  - Otherwise treat it as an object path and mint a short-lived signed URL.
 */
async function getReadUrl(stored, expirySeconds = 3600, bucket = DEFAULT_BUCKET) {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  try {
    return await getSignedUrl(stored, expirySeconds, bucket);
  } catch (_e) {
    return null;
  }
}

async function deleteFile(objectPath, bucket = DEFAULT_BUCKET) {
  await client.removeObject(bucket, objectPath);
}

async function uploadFromPath(filePath, bucket = DEFAULT_BUCKET, objectPath, contentType) {
  const safePath = sanitizeObjectPath(objectPath);
  await ensureBucket(bucket);
  await client.fPutObject(bucket, safePath, filePath, { 'Content-Type': contentType });
  return safePath;
}

module.exports = {
  uploadFile,
  getSignedUrl,
  getReadUrl,
  deleteFile,
  uploadFromPath,
  ensureBucket,
  sanitizeObjectPath,
  client,
};
