/** Shared chunked file-transfer sizing (main + renderer). */

/** Raw bytes per chunk before base64 on the wire. */
export const FILE_CHUNK_RAW_BYTES = 1024 * 1024;

/** Chunks packed into one TCP `file-chunks-batch` message. */
export const FILE_CHUNKS_PER_TCP_BATCH = 2;
