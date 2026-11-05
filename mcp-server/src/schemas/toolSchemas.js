import { z } from 'zod';

export const BaseParams = z.object({
  tabId: z.string().default('active'),
  store: z.boolean().default(false),
  project: z.string().default('default'),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  format: z.enum(['json', 'csv', 'markdown', 'html']).default('json'),
});

export const BaseResponse = z.object({
  ok: z.boolean(),
  data: z.any().optional(),
  ref: z.string().optional(),
  summary: z.any().optional(),
  warnings: z.array(z.string()).optional(),
  meta: z.object({
    tool: z.string(),
    tabId: z.union([z.string(), z.number()]).optional(),
    url: z.string().optional(),
    createdAt: z.string().optional(),
  }),
});

export const ErrorResponse = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  meta: z.object({ tool: z.string() }),
});
