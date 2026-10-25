// Where this instance lives: the core's defineApp over app.json (name, ports, folders, from MINIMAL_* in the
// environment), which is all an app tells the core about itself. Galen's and Argus's config.ts start the same way.

import path from 'node:path';
import { defineApp } from '@organon/core/server/app';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const app = defineApp(ROOT);
