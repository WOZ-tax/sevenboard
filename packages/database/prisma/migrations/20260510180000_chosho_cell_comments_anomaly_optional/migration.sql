-- chosho_cell_comments.anomaly_type を nullable に
-- Phase 2-3+: 異常検知が無い「通常セル」にもユーザーがコメント (メモ) を残せるようにする。
-- 既存の異常セルコメントは引き続き anomaly_type を保持。新規はオプショナル。

ALTER TABLE "chosho_cell_comments"
  ALTER COLUMN "anomaly_type" DROP NOT NULL;
