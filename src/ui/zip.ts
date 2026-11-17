import * as path from 'node:path';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a standard uncompressed (STORE, method 0) PKZIP archive in memory
 * using only Node.js built-in Buffers. Zero external dependencies.
 */
export function buildZipArchive(files: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let entryCount = 0;

  for (const [rawName, content] of Object.entries(files)) {
    const cleanName = path.posix.normalize(rawName.replace(/\\/g, '/')).replace(/^\/+/, '');
    if (!cleanName || cleanName.startsWith('..')) continue;

    const nameBuf = Buffer.from(cleanName, 'utf-8');
    const dataBuf = Buffer.from(content, 'utf-8');
    const checksum = crc32(dataBuf);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4);         // version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 filename flag
    localHeader.writeUInt16LE(0, 8);          // compression method: 0 (store)
    localHeader.writeUInt16LE(0, 10);         // mod time
    localHeader.writeUInt16LE(0x5421, 12);    // mod date
    localHeader.writeUInt32LE(checksum, 14);  // crc-32
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28);         // extra field length

    localParts.push(localHeader, nameBuf, dataBuf);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central file header signature
    centralHeader.writeUInt16LE(20, 4);         // version made by
    centralHeader.writeUInt16LE(20, 6);         // version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // UTF-8 filename flag
    centralHeader.writeUInt16LE(0, 10);         // compression method: 0 (store)
    centralHeader.writeUInt16LE(0, 12);         // mod time
    centralHeader.writeUInt16LE(0x5421, 14);    // mod date
    centralHeader.writeUInt32LE(checksum, 16);  // crc-32
    centralHeader.writeUInt32LE(dataBuf.length, 20); // compressed size
    centralHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30);         // extra field length
    centralHeader.writeUInt16LE(0, 32);         // file comment length
    centralHeader.writeUInt16LE(0, 34);         // disk number start
    centralHeader.writeUInt16LE(0, 36);         // internal attrs
    centralHeader.writeUInt32LE(0, 38);         // external attrs
    centralHeader.writeUInt32LE(offset, 42);    // relative offset of local header

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
    entryCount++;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  endOfCentralDir.writeUInt16LE(0, 4);          // disk number
  endOfCentralDir.writeUInt16LE(0, 6);          // start disk
  endOfCentralDir.writeUInt16LE(entryCount, 8); // entries on this disk
  endOfCentralDir.writeUInt16LE(entryCount, 10); // total entries
  endOfCentralDir.writeUInt32LE(centralDirBuffer.length, 12); // size of central directory
  endOfCentralDir.writeUInt32LE(offset, 16);    // offset of start of central directory
  endOfCentralDir.writeUInt16LE(0, 20);         // comment length

  return Buffer.concat([...localParts, centralDirBuffer, endOfCentralDir]);
}
