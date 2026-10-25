// This app's look: the core's, under its own key and with its own default accent (theme-boot.js is told the same in
// index.html). Galen's and Aristotle's own theme.svelte.ts become this file.

import { createTheme } from '@organon/core/ui/theme';

export const theme = createTheme({ key: 'minimal.look', defaultAccent: 'violet' });
