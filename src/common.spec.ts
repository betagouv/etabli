/**
 * @jest-environment node
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { isFileOutdated, maximumDownloadedFileAgeInDays } from '@etabli/src/common';

describe('isFileOutdated()', () => {
  const filePath = path.join(os.tmpdir(), `etabli-common-spec-${process.pid}`);

  afterEach(async () => {
    await fs.rm(filePath, { force: true });
  });

  it('should ask for a missing file', async () => {
    expect(await isFileOutdated(filePath)).toBe(true);
  });

  it('should keep a recent file and refresh an old one', async () => {
    await fs.writeFile(filePath, '');
    expect(await isFileOutdated(filePath)).toBe(false);

    const oldDate = new Date(Date.now() - (maximumDownloadedFileAgeInDays + 1) * 24 * 60 * 60 * 1000);
    await fs.utimes(filePath, oldDate, oldDate);
    expect(await isFileOutdated(filePath)).toBe(true);
  });
});
