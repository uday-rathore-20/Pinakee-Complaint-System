const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
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

module.exports = storage;
