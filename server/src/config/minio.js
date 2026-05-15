// server/src/config/minio.js
// Thin bootstrap that delegates to services/minio.service.js. Pre-fix this file
// defined a second MinIO client that accepted `minioadmin`/empty creds, while
// the canonical services client refuses them — leaving room for the boot path
// to succeed against a misconfigured deployment.
const minioService = require('../services/minio.service');

async function initMinio() {
  try {
    await minioService.ensureBucket();
  } catch (err) {
    // Preserve the original log-and-continue behavior — uploads will surface
    // their own errors if MinIO is unreachable at request time.
    console.error('MinIO init error:', err.message);
  }
}

module.exports = { initMinio };
