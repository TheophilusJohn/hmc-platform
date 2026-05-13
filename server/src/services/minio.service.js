const Minio = require('minio');

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const DEFAULT_BUCKET = process.env.MINIO_BUCKET || 'hmc-files';

async function ensureBucket(bucketName = DEFAULT_BUCKET) {
  const exists = await client.bucketExists(bucketName);
  if (!exists) {
    await client.makeBucket(bucketName, 'us-east-1');
    // Set public read policy for content bucket
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucketName}/content/*`] }],
    });
    await client.setBucketPolicy(bucketName, policy);
  }
}

/**
 * Upload a file buffer to MinIO
 * @param {Buffer} buffer
 * @param {string} bucket
 * @param {string} objectPath
 * @param {string} contentType
 * @returns {Promise<string>} public URL
 */
async function uploadFile(buffer, bucket = DEFAULT_BUCKET, objectPath, contentType = 'application/octet-stream') {
  await ensureBucket(bucket);
  await client.putObject(bucket, objectPath, buffer, buffer.length, { 'Content-Type': contentType });
  const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = process.env.MINIO_PORT || '9000';
  return `http://${endpoint}:${port}/${bucket}/${objectPath}`;
}

/**
 * Get a pre-signed URL for secure private access
 */
async function getSignedUrl(objectPath, expirySeconds = 3600, bucket = DEFAULT_BUCKET) {
  return client.presignedGetObject(bucket, objectPath, expirySeconds);
}

/**
 * Delete a file
 */
async function deleteFile(objectPath, bucket = DEFAULT_BUCKET) {
  await client.removeObject(bucket, objectPath);
}

/**
 * Upload from a local file path
 */
async function uploadFromPath(filePath, bucket = DEFAULT_BUCKET, objectPath, contentType) {
  await ensureBucket(bucket);
  await client.fPutObject(bucket, objectPath, filePath, { 'Content-Type': contentType });
  const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = process.env.MINIO_PORT || '9000';
  return `http://${endpoint}:${port}/${bucket}/${objectPath}`;
}

module.exports = { uploadFile, getSignedUrl, deleteFile, uploadFromPath, ensureBucket, client };
