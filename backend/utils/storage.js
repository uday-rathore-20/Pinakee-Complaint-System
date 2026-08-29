const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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
}

class S3StorageDriver extends StorageDriver {
  constructor() {
    super();

    const isProd = process.env.NODE_ENV === 'production';
    const hasS3Config = process.env.AWS_ACCESS_KEY_ID &&
                        !process.env.AWS_ACCESS_KEY_ID.startsWith('mock_') &&
                        process.env.AWS_SECRET_ACCESS_KEY &&
                        process.env.AWS_S3_BUCKET;

    // Critical fail-safe in production environment
    if (isProd && !hasS3Config) {
      throw new Error('CRITICAL CONFIGURATION ERROR: AWS S3 configuration parameters are missing or invalid in production environment.');
    }

    this.useMock = process.env.NODE_ENV === 'test' ||
                   process.env.STORAGE_DRIVER === 'mock' ||
                   (!isProd && !hasS3Config);

    if (this.useMock) {
      console.log('AWS S3: Initializing local mock storage driver simulator (test/dev mode).');
      this.uploadDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    } else {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      this.bucketName = process.env.AWS_S3_BUCKET;
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
   * Get pre-signed download URL (or mock simulation path).
   * @param {string} objectKey - File S3 key
   * @param {string} fileName - Original filename
   * @returns {Promise<string>} Pre-signed URL string
   */
  async getDownloadUrl(objectKey, fileName) {
    if (this.useMock) {
      return `/api/attachments/mock-download/${path.basename(objectKey)}?fileName=${encodeURIComponent(fileName)}`;
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
}

const storage = new S3StorageDriver();

module.exports = storage;
