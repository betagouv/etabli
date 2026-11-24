import { NextApiRequest, NextApiResponse } from 'next';

import { apiHandlerWrapper } from '@etabli/src/utils/api';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow indexing in production
  if (process.env.APP_MODE === 'prod') {
    // Note: sitemap URLs need to be absolute (ref: https://stackoverflow.com/a/14218476/3608410)
    // The searches and filters of the directory are not indexed (see `isDirectoryIndexable()`), every sheet links to some of them so
    // they are not even crawled. Its pages alone are, they link to every sheet (the longest matching rule wins)
    res.send(
      `
User-agent: *
Allow: /
Disallow: /initiatives?
Allow: /initiatives?page=
Disallow: /initiatives?page=*&
Disallow: /*view=map
Disallow: /api/trpc/*getOrganizationsMap
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
