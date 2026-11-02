import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseEvidenceJson } from '../../../../lib/validation-evidence.mjs';
import { projectEvidence } from './evidence.mjs';

export async function readEvidenceDirectory(directory) {
  if (directory !== resolve(directory) || await realpath(directory) !== directory) throw Error('Use an absolute canonical evidence directory.');
  async function read(name) {
    const handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('Evidence must be a regular file of at most 1 MiB.');
      const bytes = Buffer.alloc(1024 * 1024 + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 1024 * 1024) throw Error('Evidence exceeded the read bound.');
      return bytes.subarray(0, bytesRead);
    } finally { await handle.close(); }
  }
  const expected = parseEvidenceJson(await read('expected.json'));
  const source = parseEvidenceJson(await read('source.json'));
  const artifactBytes = await read('artifact.json');
  return projectEvidence({ expected, source, artifactBytes });
}
