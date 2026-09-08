const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getJwtSecret } = require('./jwt');

/**
 * Resolve HMAC signing secret for local storage tokens.
 * Uses STORAGE_HMAC_SECRET if configured, otherwise reuses the production-hardened JWT_SECRET.
 */
const getHmacSecret = () => {
  return process.env.STORAGE_HMAC_SECRET || getJwtSecret();
};

/**
 * Generate a cryptographically secure HMAC SHA256 token for time-limited local file downloads.
 * @param {string} filename - Target basename of the file
 * @param {number} expires - Epoch timestamp (in seconds)
 * @returns {string} Hex-encoded HMAC signature
 */
const generateLocalDownloadToken = (filename, expires) => {
  const secret = getHmacSecret();
  const data = `${filename}:${expires}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};

/**
 * Verify a local download token against expected signature, expiration, and path safety.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 * @param {string} filename - File basename from request parameters
 * @param {string|number} expires - Expiration timestamp from query
 * @param {string} token - HMAC signature token from query
 * @returns {boolean} True if signature is authentic and unexpired
 */
const verifyLocalDownloadToken = (filename, expires, token) => {
  if (!filename || !expires || !token) return false;

  // Prevent path traversal in filename parameter
  const cleanFilename = path.basename(filename);
  if (cleanFilename !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  const expiresNum = parseInt(expires, 10);
  if (isNaN(expiresNum) || expiresNum <= 0) return false;

  const currentEpoch = Math.floor(Date.now() / 1000);
  if (currentEpoch > expiresNum) return false;

  const expectedToken = generateLocalDownloadToken(cleanFilename, expiresNum);

  try {
    const tokenBuf = Buffer.from(token, 'hex');
    const expectedBuf = Buffer.from(expectedToken, 'hex');
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  } catch (err) {
    return false;
  }
};

class StorageDriver {
  async saveFile(file, detectedMimeType) {
    throw new Error('saveFile not implemented');
  }
  async getDownloadUrl(objectKey, fileName) {
    throw new Error('getDownloadUrl not implemented');
  }
  async deleteFile(objectKey) {
    throw new Error('deleteFile not implemented');
  }
  async saveArchiveFile(fileName, buffer) {
    throw new Error('saveArchiveFile not implemented');
  }
  async listArchiveFiles() {
    throw new Error('listArchiveFiles not implemented');
  }
  async getArchiveStreamOrUrl(fileName) {
    throw new Error('getArchiveStreamOrUrl not implemented');
  }
  async deleteArchiveFile(fileName) {
    throw new Error('deleteArchiveFile not implemented');
  }
}

class S3StorageDriver extends StorageDriver {
  constructor() {
    super();

    const isProd = process.env.NODE_ENV === 'production';
    const driverConfig = (process.env.STORAGE_DRIVER || (isProd ? 's3' : 'local')).toLowerCase();

    if (driverConfig !== 'local' && driverConfig !== 's3' && driverConfig !== 'mock') {
      throw new Error(`CRITICAL CONFIGURATION ERROR: Invalid STORAGE_DRIVER "${process.env.STORAGE_DRIVER}". Supported values are "local" and "s3".`);
    }

    const hasS3Config = process.env.AWS_ACCESS_KEY_ID &&
                        !process.env.AWS_ACCESS_KEY_ID.startsWith('mock_') &&
                        process.env.AWS_SECRET_ACCESS_KEY &&
                        process.env.AWS_S3_BUCKET;

    if (driverConfig === 's3') {
      if (!hasS3Config) {
        throw new Error('CRITICAL CONFIGURATION ERROR: AWS S3 configuration parameters (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET) are missing or invalid.');
      }
      this.useMock = false;
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      this.bucketName = process.env.AWS_S3_BUCKET;
    } else {
      // Local storage driver (for dev, test, or production on-premise local disk)
      this.useMock = true;
      this.uploadDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    }

    this.archiveDir = path.join(__dirname, '..', 'archives');
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  /**
   * Save file using active driver.
   * @param {Object} file - Express Multer file object
   * @param {string} detectedMimeType - Formally validated MIME type
   * @returns {Promise<string>} Saved object key
   */
  async saveFile(file, detectedMimeType) {
    const timestamp = Date.now();
    // Sanitize filename to prevent path traversal
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueKey = `attachments/${timestamp}-${cleanName}`;

    if (this.useMock) {
      const destinationPath = path.join(this.uploadDir, `${timestamp}-${cleanName}`);
      await fs.promises.writeFile(destinationPath, file.buffer);
      return uniqueKey;
    } else {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: uniqueKey,
        Body: file.buffer,
        ContentType: detectedMimeType
      });
      await this.s3Client.send(command);
      return uniqueKey;
    }
  }

  /**
   * Get pre-signed download URL (or HMAC-signed local URL).
   * @param {string} objectKey - File S3 key
   * @param {string} fileName - Original filename
   * @returns {Promise<string>} Signed URL string
   */
  async getDownloadUrl(objectKey, fileName) {
    if (this.useMock) {
      const baseFilename = path.basename(objectKey);
      const expiresInSec = 900; // 15 minutes
      const expires = Math.floor(Date.now() / 1000) + expiresInSec;
      const token = generateLocalDownloadToken(baseFilename, expires);
      return `/api/attachments/mock-download/${baseFilename}?fileName=${encodeURIComponent(fileName)}&expires=${expires}&token=${token}`;
    } else {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        ResponseContentDisposition: `attachment; filename="${fileName}"`
      });
      // Pre-signed URL valid for 15 minutes (900 seconds)
      return await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
    }
  }

  /**
   * Delete object key.
   * @param {string} objectKey - Key to delete
   */
  async deleteFile(objectKey) {
    if (this.useMock) {
      const filename = path.basename(objectKey);
      const filePath = path.join(this.uploadDir, filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } else {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey
      });
      await this.s3Client.send(command);
    }
  }

  /**
   * Save compressed archive file.
   * @param {string} fileName - Target archive filename
   * @param {Buffer} buffer - Compressed file buffer
   */
  async saveArchiveFile(fileName, buffer) {
    if (this.useMock) {
      const destinationPath = path.join(this.archiveDir, fileName);
      await fs.promises.writeFile(destinationPath, buffer);
    } else {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: `archives/${fileName}`,
        Body: buffer,
        ContentType: 'application/x-gzip'
      });
      await this.s3Client.send(command);
    }
  }

  /**
   * List all archive files under archives/ prefix (or mock local folder).
   * @returns {Promise<Array>} List of archive objects
   */
  async listArchiveFiles() {
    const archivePattern = /^archive-(audit|notifications|emails)-\d{8}-\d{6}\.json\.gz$/;
    if (this.useMock) {
      if (!fs.existsSync(this.archiveDir)) return [];
      const files = await fs.promises.readdir(this.archiveDir);
      const list = [];
      for (const file of files) {
        if (archivePattern.test(file)) {
          const stats = await fs.promises.stat(path.join(this.archiveDir, file));
          list.push({
            filename: file,
            size: stats.size,
            created_at: stats.mtime
          });
        }
      }
      return list;
    } else {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'archives/'
      });
      const res = await this.s3Client.send(command);
      const list = [];
      if (res.Contents) {
        for (const item of res.Contents) {
          const filename = path.basename(item.Key);
          if (archivePattern.test(filename)) {
            list.push({
              filename,
              size: item.Size,
              created_at: item.LastModified
            });
          }
        }
      }
      return list;
    }
  }

  /**
   * Get archive presigned download URL (or mock simulation path).
   * @param {string} fileName - Archive filename
   * @returns {Promise<Object>} Object with type and url/filePath
   */
  async getArchiveStreamOrUrl(fileName) {
    if (this.useMock) {
      const filePath = path.join(this.archiveDir, fileName);
      return { type: 'local', filePath };
    } else {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: `archives/${fileName}`,
        ResponseContentDisposition: `attachment; filename="${fileName}"`
      });
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: 600 });
      return { type: 's3', url };
    }
  }

  /**
   * Delete archive file from storage backend.
   * @param {string} fileName - Filename to delete
   */
  async deleteArchiveFile(fileName) {
    if (this.useMock) {
      const filePath = path.join(this.archiveDir, fileName);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } else {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: `archives/${fileName}`
      });
      await this.s3Client.send(command);
    }
  }
}

const storage = new S3StorageDriver();
storage.generateLocalDownloadToken = generateLocalDownloadToken;
storage.verifyLocalDownloadToken = verifyLocalDownloadToken;
storage.getHmacSecret = getHmacSecret;

module.exports = storage;
module.exports.generateLocalDownloadToken = generateLocalDownloadToken;
module.exports.verifyLocalDownloadToken = verifyLocalDownloadToken;
module.exports.getHmacSecret = getHmacSecret;
