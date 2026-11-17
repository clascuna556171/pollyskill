import fs from 'node:fs';
import path from 'node:path';

const srcPublic = path.resolve(process.cwd(), 'src', 'ui', 'public');
const distPublic = path.resolve(process.cwd(), 'dist', 'ui', 'public');

if (fs.existsSync(srcPublic)) {
  fs.mkdirSync(distPublic, { recursive: true });
  fs.cpSync(srcPublic, distPublic, { recursive: true, force: true });
}
