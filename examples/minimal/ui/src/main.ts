import '@organon/core/ui/fonts.css';
import '@organon/core/ui/tokens.css';
import '@organon/core/ui/base.css';
import '@organon/core/ui/shell.css';
import '@organon/core/ui/dash.css';
import '@organon/core/ui/charts.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') as HTMLElement });
