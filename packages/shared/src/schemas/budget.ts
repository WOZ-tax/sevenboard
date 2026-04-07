import { z } from 'zod';

export const budgetEntrySchema = z.object({
  accountId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  month: z.string(), // "2026-04-01"
  amount: z.number(),
});

export const updateBudgetEntriesSchema = z.object({
  entries: z.array(budgetEntrySchema),
});

export const createBudgetVersionSchema = z.object({
  name: z.string().min(1),
  scenarioType: z.enum(['BASE', 'UPSIDE', 'DOWNSIDE']),
});

export type BudgetEntryInput = z.infer<typeof budgetEntrySchema>;
export type UpdateBudgetEntriesInput = z.infer<typeof updateBudgetEntriesSchema>;
export type CreateBudgetVersionInput = z.infer<typeof createBudgetVersionSchema>;
