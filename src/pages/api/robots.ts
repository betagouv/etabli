import { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';

import { apiHandlerWrapper } from '@etabli/src/utils/api';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

const { publicRuntimeConfig } = getConfig();

export function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow indexing in production
  if (publicRuntimeConfig.appMode === 'prod') {
    // Note: sitemap URLs need to be absolute (ref: https://stackoverflow.com/a/14218476/3608410)
    res.send(
      `
User-agent: *
Allow: /
Sitemap: ${linkRegistry.get('sitemapIndex', undefined, { absolute: true })}
`.trim()
    );
  } else {
    res.send(
      `
User-agent: *
Disallow: /
Allow: /.well-known/
`.trim()
    );
  }
}

export default apiHandlerWrapper(handler);
