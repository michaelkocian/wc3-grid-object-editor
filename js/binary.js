// ================================================================
// BINARY READER
//
// Reference: WC3MapTranslator W3Buffer / ObjectsTranslator.ts
// All multi-byte values are little-endian.
// Strings are null-terminated UTF-8.
// IDs are 4 raw ASCII bytes (or 0x00000000 for "none").
// ================================================================

export class BinaryReader {
  constructor(arrayBuffer) {
    this.dataView  = new DataView(arrayBuffer);
    this.byteArray = new Uint8Array(arrayBuffer);
    this.position  = 0;
    this.length    = arrayBuffer.byteLength;
  }

  hasMoreData() {
    return this.position < this.length;
  }

  readInt32() {
    const value = this.dataView.getInt32(this.position, true);
    this.position += 4;
    return value;
  }

  readUInt32() {
    const value = this.dataView.getUint32(this.position, true);
    this.position += 4;
    return value;
  }

  readFloat32() {
    const value = this.dataView.getFloat32(this.position, true);
    this.position += 4;
    return value;
  }

  readObjectId() {
    const byte0 = this.byteArray[this.position];
    const byte1 = this.byteArray[this.position + 1];
    const byte2 = this.byteArray[this.position + 2];
    const byte3 = this.byteArray[this.position + 3];
    this.position += 4;

    if (byte0 === 0 && byte1 === 0 && byte2 === 0 && byte3 === 0) {
      return '\0\0\0\0';
    }
    return String.fromCharCode(byte0, byte1, byte2, byte3);
  }

  readNullTerminatedString() {
    let endPosition = this.position;
    while (endPosition < this.length && this.byteArray[endPosition] !== 0) {
      endPosition++;
    }
    const bytes = this.byteArray.subarray(this.position, endPosition);
    this.position = endPosition + 1;
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ================================================================
// BINARY WRITER
//
// Builds a list of Uint8Array chunks, then concatenates into a Blob.
// ================================================================

export class BinaryWriter {
  constructor() {
    this.chunks = [];
  }

  writeInt32(value) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    this.chunks.push(new Uint8Array(buffer));
  }

  writeUInt32(value) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    this.chunks.push(new Uint8Array(buffer));
  }

  writeFloat32(value) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    this.chunks.push(new Uint8Array(buffer));
  }

  writeObjectId(idString) {
    const bytes = new Uint8Array(4);
    if (idString && idString !== '\0\0\0\0') {
      for (let i = 0; i < 4 && i < idString.length; i++) {
        bytes[i] = idString.charCodeAt(i) & 0xFF;
      }
    }
    this.chunks.push(bytes);
  }

  writeNullTerminatedString(str) {
    this.chunks.push(new TextEncoder().encode(str));
    this.chunks.push(new Uint8Array([0]));
  }

  toBlob() {
    return new Blob(this.chunks, { type: 'application/octet-stream' });
  }

  toUint8Array() {
    let totalSize = 0;
    for (const chunk of this.chunks) totalSize += chunk.byteLength;
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}
