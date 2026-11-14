import { parentPort, workerData } from 'node:worker_threads';
import { extractDocument } from './documents.js';
try { parentPort?.postMessage({ result: await extractDocument(workerData.data, workerData.name) }); }
catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : '文档解析失败' }); }
