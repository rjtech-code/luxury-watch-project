/**
 * Vercel serverless entry: the whole Express API runs as one function on the same domain as the website,
 * so login cookies are first-party and /uploads works. vercel.json routes /api, /uploads, /sitemap.xml and
 * /robots.txt here. Locally the server still runs with `npm run dev` (server/src/server.js).
 */
import { createApp } from '../server/src/app.js';

export default createApp();
