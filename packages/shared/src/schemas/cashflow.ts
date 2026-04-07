import { z } from 'zod';

export const cashflowCategorySchema = z.object({
  name: z.string().min(1),
  direction: z.enum(['IN', 'OUT']),
  cfType: z.enum(['OPERATING', 'INVESTING', 'FINANCING']),
  isFixed: z.boolean().default(false),
  recurrenceRule: z.string().optional(),
});

export const cashflowEntrySchema = z.object({
  categoryId: z.string().uuid(),
  entryDate: z.string(),
  amount: z.number().positive(),
  isActual: z.boolean().default(false),
  tradePartner: z.string().optional(),
  description: z.string().optional(),
});

export type CashflowCategoryInput = z.infer<typeof cashflowCategorySchema>;
export type CashflowEntryInput = z.infer<typeof cashflowEntrySchema>;
