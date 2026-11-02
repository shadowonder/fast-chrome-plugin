import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Fast Chrome Starter',
  description: 'A small React extension with on-demand DOM access and storage examples.',
  version: pkg.version,
  minimum_chrome_version: '120',
  action: { default_popup: 'index.html', default_title: 'Fast Chrome Starter' },
  icons: { 16: 'image/16x16.png', 48: 'image/48x48.png', 128: 'image/128x128.png' },
  permissions: ['activeTab', 'scripting', 'storage'],
});
