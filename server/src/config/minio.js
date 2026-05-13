const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.MINIO_BUCKET || 'hmc-files';

async function initMinio() {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) {
      await minioClient.makeBucket(BUCKET, 'ap-south-1');
      console.log(`MinIO bucket '${BUCKET}' created`);
    }
  } catch (err) {
    console.error('MinIO init error:', err.message);
  }
}

module.exports = { minioClient, BUCKET, initMinio };
