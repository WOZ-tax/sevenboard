-- Organization に「原価計算運用フラグ」を追加。
-- 既定 false: 中小企業では原価計算を実運用していないケースが多いため、
-- 売上総利益率（grossProfitMargin）を信用しないモードを既定とする。
-- 顧問先ごとに owner / advisor がトグル可能。

ALTER TABLE "organizations"
  ADD COLUMN "uses_cost_accounting" BOOLEAN NOT NULL DEFAULT false;
