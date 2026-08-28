const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to be within the project folder.
  // This solves issues on platforms like CodeSandbox, Vercel, Render where
  // the global ~/.cache folder might not be preserved or accessible.
  cacheDirectory: join(__dirname, '.puppeteer_cache'),
};
