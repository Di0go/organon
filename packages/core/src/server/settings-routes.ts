// Who runs in the drawer, as the interface reads and changes it (ui/AgentSettings.svelte): GET and PUT /api/settings,
// and GET /api/settings/models, the models the API offers, asked of it with the saved address and key. The API key
// only ever goes in, never out. The app's view may carry keys of its own (Galen's watch door); its own routes for them
// stay the app's.
//
// From Aristotle's and Galen's server/index.ts, where the same three routes were written twice.

import { json, type Route, readJson } from './http.ts';
import { type LlmIdentity, listModels } from './llm.ts';
import { type Settings, SettingsError } from './settings.ts';
import type { SettingsBody } from '../shared/agents.ts';

export interface SettingsRoutesOptions {
  /** What GET and PUT answer with: the core's view (settings.view), or the app's with its own keys on it. */
  view: () => unknown;
  /** Who asks for the models, as OpenRouter lists the apps that say so. */
  identity?: LlmIdentity;
  /** How long the API has to list its models. */
  timeoutMs?: number;
}

export function settingsRoutes(settings: Settings, { view, identity, timeoutMs = 20_000 }: SettingsRoutesOptions): Route {
  return async (req, res, route) => {
    if (req.method === 'GET' && route === '/api/settings') return json(res, 200, view());
    if (req.method === 'PUT' && route === '/api/settings') {
      const body = (await readJson(req)) as SettingsBody | null;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Send the settings as an object' });
      try {
        await settings.update(body);
        return json(res, 200, view());
      } catch (err) {
        if (err instanceof SettingsError) return json(res, 400, { error: err.message });
        throw err;
      }
    }
    if (req.method === 'GET' && route === '/api/settings/models') {
      const { baseUrl, apiKey } = settings.api;
      if (!baseUrl) return json(res, 400, { error: 'Set the address of the API first' });
      try {
        const models = await listModels({ baseUrl, apiKey }, AbortSignal.timeout(timeoutMs), identity);
        settings.rememberModels(models);
        return json(res, 200, models);
      } catch (err) {
        return json(res, 502, { error: (err as Error).message });
      }
    }
    return false;
  };
}
