import { NextApiRequest, NextApiResponse } from 'next';
import { SitemapIndexStream, SitemapItemLoose, SitemapStream } from 'sitemap';
import { createGzip } from 'zlib';
import { z } from 'zod';

import { prisma } from '@etabli/src/prisma/client';
import { apiHandlerWrapper } from '@etabli/src/utils/api';
import { linkRegistry } from '@etabli/src/utils/routes/registry';
import { getBaseUrl } from '@etabli/src/utils/url';

const PathSchema = z.literal('index').or(z.coerce.number().positive());

const chunkSize = 40_000; // The maximum allowed by Google is 50k URLs or 50MB

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Either to return all sitemaps index, or a specific sitemap
  const value = PathSchema.parse(req.query.sitemap);

  // Listing static routes first
  const routes: string[] = [
    linkRegistry.get('assistant', undefined),
    linkRegistry.get('explore', undefined),
    linkRegistry.get('home', undefined),
    linkRegistry.get('initiatives', undefined),
  ];

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Encoding', 'gzip');

  if (value === 'index') {
    const initiativesCount = await prisma.initiative.count({});
    const sitemapsCount = Math.ceil((routes.length + initiativesCount) / chunkSize);

    const stream = new SitemapIndexStream({});
    const pipeline = stream.pipe(createGzip());

    for (let i = 1; i <= sitemapsCount; i++) {
      // URLs must be absolute to be indexed
      stream.write({ url: linkRegistry.get('sitemap', { sitemapId: i }, { absolute: true }) });
    }

    stream.end();
    pipeline.pipe(res).on('error', (error) => {
      throw error;
    });
  } else {
    const stream = new SitemapStream({ hostname: getBaseUrl() });
    const pipeline = stream.pipe(createGzip());

    const page = value;

    const initiatives = await prisma.initiative.findMany({
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
      skip: (page - 1) * chunkSize, // The static routes are limited so we are fine if the first chunk will be for example 40_013 length
      take: chunkSize,
    });

    for (const staticRoute of routes) {
      stream.write({ url: staticRoute, changefreq: 'weekly', priority: 0.8 } as SitemapItemLoose);
    }

    for (const initiative of initiatives) {
      stream.write({
        url: linkRegistry.get('initiative', { initiativeId: initiative.id }),
        lastmod: initiative.updatedAt.toISOString(),
        changefreq: 'monthly',
        priority: 0.5,
      } as SitemapItemLoose);
    }

    stream.end();
    pipeline.pipe(res).on('error', (error) => {
      throw error;
    });
  }
}

export default apiHandlerWrapper(handler);
