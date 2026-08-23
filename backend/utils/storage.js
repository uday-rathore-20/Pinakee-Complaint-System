const fs = require('fs');
const path = require('path');

// Base Storage Interface/Contract
class StorageDriver {
  async saveFile(file) {
    throw new Error('saveFile not implemented');
  }
  async getFileStream(filePath) {
    throw new Error('getFileStream not implemented');
  }
  async deleteFile(filePath) {
    throw new Error('deleteFile not implemented');
  }
}

// Local Disk Storage Driver
class LocalStorageDriver extends StorageDriver {
  constructor() {
    super();
    this.uploadDir = path.join(__dirname, '..', 'uploads');
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Save file to local uploads directory.
   * @param {Object} file - Express Multer file object
   * @returns {Promise<string>} Saved file relative path
   */
  async saveFile(file) {
    const timestamp = Date.now();
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueName = `${timestamp}-${cleanName}`;
    const destinationPath = path.join(this.uploadDir, uniqueName);

    // Write buffer to destination path
    await fs.promises.writeFile(destinationPath, file.buffer);
    
    // Return relative file path (platform-independent separator)
    return `uploads/${uniqueName}`;
  }

  /**
   * Get readable stream for file.
   * @param {string} relativePath - File relative path
   * @returns {Promise<fs.ReadStream>} Readable file stream
   */
  async getFileStream(relativePath) {
    const fullPath = path.join(__dirname, '..', relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found on local disk');
    }
    return fs.createReadStream(fullPath);
  }

  /**
   * Delete file from local uploads directory.
   * @param {string} relativePath - File relative path
   */
  async deleteFile(relativePath) {
    const fullPath = path.join(__dirname, '..', relativePath);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }
}

// Export active driver (swappable to S3/Supabase storage in future milestones)
const storage = new LocalStorageDriver();

module.exports = storage;
