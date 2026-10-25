// pnpm dev: the core's dev instance (server on 4970, Vite on 5193, data in .dev/), as in the apps. Ctrl+C stops both.
import path from 'node:path';
import { runDev } from '@organon/core/server/dev';

runDev(path.resolve(import.meta.dirname, '..'));
