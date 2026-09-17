type Side = { account_name?: string; value?: number; tax_value?: number };
type RawJournal = {
  id?: string; transaction_date?: string; date?: string; recognized_at?: string; amount?: number; description?: string; memo?: string;
  branches?: { debitor?: Side; creditor?: Side; remark?: string }[];
  details?: { debit_account_name?: string; credit_account_name?: string; account_item_name?: string; amount?: number; description?: string }[];
};
export function journalDisplayRows(journals: RawJournal[], accountName = "") {
  return journals.flatMap((j, index) => {
    const date = j.transaction_date ?? j.date ?? j.recognized_at ?? "";
    if (j.branches?.length) return j.branches.flatMap((branch, line) => {
      const debit = branch.debitor?.account_name ?? "";
      const credit = branch.creditor?.account_name ?? "";
      if (accountName && !debit.includes(accountName) && !credit.includes(accountName)) return [];
      const side = accountName && credit.includes(accountName) ? branch.creditor : branch.debitor ?? branch.creditor;
      return [{ id: `${j.id ?? index}:${line}`, date, debit, credit,
        amount: Number(side?.value ?? 0) + Number(side?.tax_value ?? 0), description: branch.remark ?? j.memo ?? j.description ?? "" }];
    });
    return [{ id: String(j.id ?? index), date, debit: j.details?.[0]?.debit_account_name ?? j.details?.[0]?.account_item_name ?? "",
      credit: j.details?.[0]?.credit_account_name ?? "", amount: Number(j.details?.[0]?.amount ?? j.amount ?? 0),
      description: j.description ?? j.details?.[0]?.description ?? "" }];
  });
}
