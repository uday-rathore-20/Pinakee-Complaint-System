const MAGIC_HEADERS = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
  jpg: [0xFF, 0xD8, 0xFF], // JPEG
  jpeg: [0xFF, 0xD8, 0xFF], // JPEG
  gif: [0x47, 0x49, 0x46, 0x38], // GIF
  docx: [0x50, 0x4B, 0x03, 0x04], // ZIP container
  xlsx: [0x50, 0x4B, 0x03, 0x04], // ZIP container
  pptx: [0x50, 0x4B, 0x03, 0x04]  // ZIP container
};

const MIME_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv'
};

const BLOCKED_SIGNATURES = [
  { name: 'exe_dll', signature: [0x4D, 0x5A] }, // MZ (PE)
  { name: 'elf', signature: [0x7F, 0x45, 0x4C, 0x46] }, // ELF
  { name: 'mach_o_32', signature: [0xFE, 0xED, 0xFA, 0xCE] },
  { name: 'mach_o_64', signature: [0xFE, 0xED, 0xFA, 0xCF] }
];

const getZipEntries = (buffer) => {
  const entries = new Set();
  let pos = 0;
  while (pos < buffer.length - 30) {
    if (buffer[pos] === 0x50 && buffer[pos+1] === 0x4B && buffer[pos+2] === 0x03 && buffer[pos+3] === 0x04) {
      const nameLen = buffer.readUInt16LE(pos + 26);
      const extraLen = buffer.readUInt16LE(pos + 28);
      const compSize = buffer.readUInt32LE(pos + 18);

      if (pos + 30 + nameLen <= buffer.length) {
        const name = buffer.toString('utf8', pos + 30, pos + 30 + nameLen);
        entries.add(name);
      }

      if (compSize > 0 && pos + 30 + nameLen + extraLen + compSize < buffer.length) {
        pos += 30 + nameLen + extraLen + compSize;
      } else {
        pos += 30 + nameLen + extraLen;
      }
    } else {
      pos++;
    }
  }
  return Array.from(entries);
};

const isBinaryBuffer = (buffer) => {
  const len = Math.min(buffer.length, 1024);
  for (let i = 0; i < len; i++) {
    const byte = buffer[i];
    if (byte === 0) return true;
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      return true;
    }
  }
  return false;
};

const validateFileSignature = (buffer, fileName) => {
  if (!fileName || !buffer || buffer.length === 0) {
    return { valid: false, reason: 'Empty file or filename' };
  }

  const parts = fileName.split('.');
  if (parts.length < 2) {
    return { valid: false, reason: 'Missing file extension' };
  }

  const ext = parts.pop().toLowerCase();

  // 1. Rejection of explicit executables signatures
  for (const blocked of BLOCKED_SIGNATURES) {
    let match = true;
    for (let i = 0; i < blocked.signature.length; i++) {
      if (buffer[i] !== blocked.signature[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      return { valid: false, reason: `Blocked executable signature detected: ${blocked.name}` };
    }
  }

  // 2. Validate matching signature for standard extensions
  const expectedMagic = MAGIC_HEADERS[ext];
  if (expectedMagic) {
    let match = true;
    for (let i = 0; i < expectedMagic.length; i++) {
      if (buffer[i] !== expectedMagic[i]) {
        match = false;
        break;
      }
    }
    if (!match) {
      return { valid: false, reason: `Mismatched file signature for extension .${ext}` };
    }

    // 3. Strict MS Office Open XML checks (parsing actual ZIP entries)
    if (['docx', 'xlsx', 'pptx'].includes(ext)) {
      const entries = getZipEntries(buffer);
      const hasContentTypes = entries.includes('[Content_Types].xml');
      const hasRequiredDir = entries.some(entry => {
        if (ext === 'docx') return entry.startsWith('word/');
        if (ext === 'xlsx') return entry.startsWith('xl/');
        if (ext === 'pptx') return entry.startsWith('ppt/');
        return false;
      });

      if (!hasContentTypes || !hasRequiredDir) {
        return { valid: false, reason: `Invalid Office Open XML structure for extension .${ext}` };
      }
    }
  } else if (ext === 'txt' || ext === 'csv') {
    if (isBinaryBuffer(buffer)) {
      return { valid: false, reason: `Binary bytes detected in text file .${ext}` };
    }
  } else {
    return { valid: false, reason: `Unsupported file extension .${ext}` };
  }

  return { valid: true, mimeType: MIME_TYPES[ext] };
};

module.exports = { validateFileSignature };
