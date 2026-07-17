// ── PNG 二进制嵌入（SillyTavern chara_card_v2）──

import * as fs from 'fs';

/**
 * CRC-32 (IEEE 802.3)
 * 多项式: 0xEDB88320
 */
export function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

interface PngChunk {
  length: number;
  type: Buffer;
  data: Buffer;
  crc: Buffer;
}

/** 解析 PNG 为 chunk 列表 */
function parsePngChunks(pngData: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let pos = 8; // 跳过 PNG signature
  while (pos < pngData.length) {
    if (pos + 8 > pngData.length) break;
    const length = pngData.readUInt32BE(pos);
    const chunkType = pngData.subarray(pos + 4, pos + 8);
    const chunkData = pngData.subarray(pos + 8, pos + 8 + length);
    const crc = pngData.subarray(pos + 8 + length, pos + 12 + length);
    chunks.push({ length, type: chunkType, data: chunkData, crc });
    pos += 12 + length;
    if (chunkType.toString() === 'IEND') break;
  }
  return chunks;
}

/** 打包 uint32 为大端 Buffer */
function packUint32BE(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value >>> 0, 0);
  return buf;
}

/**
 * 将 chara_card_v2 JSON 嵌入 PNG
 * - 读取底图 PNG
 * - 剥离已有 chara tEXt chunk
 * - 在 IEND 前插入新的 chara tEXt chunk
 */
export function embedCharaPng(
  basePngPath: string,
  compactJsonBytes: Buffer,
  outputPath: string
): number {
  const pngData = fs.readFileSync(basePngPath);
  const chunks = parsePngChunks(pngData);

  // base64 编码 JSON
  const charaB64 = compactJsonBytes.toString('base64');
  const tEXtData = Buffer.concat([
    Buffer.from('chara\x00', 'latin1'),
    Buffer.from(charaB64, 'latin1'),
  ]);

  // 计算 CRC
  const tEXtCrc = packUint32BE(crc32(Buffer.concat([Buffer.from('tEXt'), tEXtData])));

  // 重建 PNG（跳过旧 chara chunk，IEND 前插入新 chara chunk）
  const result: Buffer[] = [Buffer.from('\x89PNG\r\n\x1a\n', 'binary')];
  for (const chunk of chunks) {
    // 跳过旧的 chara tEXt chunk
    if (chunk.type.toString() === 'tEXt') {
      const nullPos = chunk.data.indexOf(0);
      if (nullPos !== -1 && chunk.data.subarray(0, nullPos).toString('latin1') === 'chara') {
        continue;
      }
    }

    // IEND 前插入新的 chara chunk
    if (chunk.type.toString() === 'IEND') {
      result.push(packUint32BE(tEXtData.length));
      result.push(Buffer.from('tEXt'));
      result.push(tEXtData);
      result.push(tEXtCrc);
    }

    // 写入当前 chunk（包括 IEND）
    result.push(packUint32BE(chunk.length));
    result.push(chunk.type);
    result.push(chunk.data);
    result.push(chunk.crc);
  }

  const output = Buffer.concat(result);
  fs.writeFileSync(outputPath, output);
  return output.length;
}
