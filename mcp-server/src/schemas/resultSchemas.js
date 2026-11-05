import { z } from 'zod';

export const ResultRef = z.string().regex(/^[a-z0-9_]+$/, 'ref must be snake_case alphanumeric');

export const StoredResult = z.object({
  ref: ResultRef,
  tool: z.string(),
  url: z.string().optional(),
  project: z.string().default('default'),
  data: z.any(),
  summary: z.any().optional(),
  createdAt: z.string(),
});

export const PageData = z.object({
  url: z.string(),
  title: z.string().optional(),
  links: z.array(z.object({ href: z.string(), text: z.string() })).optional(),
  images: z.array(z.object({ src: z.string(), alt: z.string().optional() })).optional(),
  tables: z.array(z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  structuredData: z.array(z.any()).optional(),
});
