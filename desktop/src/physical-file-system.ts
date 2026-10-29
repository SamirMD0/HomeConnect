import fs from 'node:fs/promises';

// Electron's patched fs treats app.asar as a virtual directory. Application
// snapshots need the physical archive file, including its original bytes.
export const physicalFs: typeof fs = process.versions.electron
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require('original-fs') as { promises: typeof fs }).promises
  : fs;
