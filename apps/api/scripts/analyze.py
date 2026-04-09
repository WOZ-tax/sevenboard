#!/usr/bin/env python3
"""
経理レビュー分析スクリプト（拡張版）
試算表CSV（損益計算書・貸借対照表・仕訳帳）を読み込み、
チェックリストに沿った検証＋解釈的分析を実行する。

出力:
  review_result.json — 構造化された分析結果。generate_report.js の入力となる。

使い方:
  python analyze.py <会社フォルダのパス>
"""

import csv
import json
import sys
import os
import glob
from collections import Counter, defaultdict

# ============================================================
# ビジネスルール定数
# ============================================================
ENTERTAINMENT_THRESHOLD = 10000  # 1人あたり判定基準（2024年4月改正後）
ACCOUNTS_MUST_BE_TAISYOGAI = ["役員報酬", "給料手当", "法定福利費", "租税公課", "減価償却費", "保険料"]
PERSONAL_KEYWORDS = ["子供", "家族", "私用", "個人", "プライベート", "自宅"]
STAGNANT_THRESHOLD = 1000000  # 滞留勘定の閾値

# 海外SaaS インボイス登録番号辞書（確認済みのもの）
# key: 摘要の大文字マッチキーワード → 登録番号・法人名
OVERSEAS_SAAS_INVOICE = {
    'GITHUB':      {"no": "T4700150079306", "name": "GitHub, Inc."},
    'GITLAB':      None,
    'SLACK':       {"no": "T4700150097910", "name": "Slack Technologies Limited"},
    'AWS':         {"no": "T9700150104216", "name": "Amazon Web Services Inc."},
    'AMAZON WEB':  {"no": "T9700150104216", "name": "Amazon Web Services Inc."},
    'GOOGLE':      {"no": "T4700150006045", "name": "Google Asia Pacific Pte. Ltd."},
    'ZOOM':        {"no": "T6700150118763", "name": "Zoom Video Communications, Inc."},
    'ADOBE':       {"no": "T3700150007275", "name": "Adobe Systems Software Ireland Ltd."},
    'DROPBOX':     {"no": "T6700150104169", "name": "Dropbox International Unlimited Co."},
    'CANVA':       {"no": "T2700150107555", "name": "Canva Pty Ltd"},
    'OPENAI':      {"no": "T4700150127989", "name": "OpenAI"},
    'CHATGPT':     {"no": "T4700150127989", "name": "OpenAI"},
    'VIMEO':       {"no": "T1700150072560", "name": "Vimeo.com, Inc."},
    '1PASSWORD':   {"no": "T1700150098143", "name": "AgileBits Inc."},
    'NOTION':      None,
    'MICROSOFT':   None,
    'AZURE':       None,
    'FIGMA':       None,
    'STRIPE':      None,
    'SHOPIFY':     None,
    'HUBSPOT':     None,
    'SALESFORCE':  None,
    'MAILCHIMP':   None,
    'PERPLEXITY':  None,
    'CURSOR':      None,
    'MIRO':        None,
    'NETLIFY':     None,
    'HEROKU':      None,
    'VERCEL':      None,
    'PADDLE':      None,
    'EXPEDIA':     None,
    'META':        None,
    'FACEBOOK':    None,
    'INSTAGRAM':   None,
    'X.COM':       None,
    'TWITTER':     None,
    'ZAPIER':      None,
}


def find_csv(folder, prefix):
    matches = glob.glob(os.path.join(folder, f"{prefix}*.csv"))
    if not matches:
        raise FileNotFoundError(f"{prefix}*.csv が見つかりません: {folder}")
    return matches[0]


def read_csv_rows(path):
    for enc in ["cp932", "shift_jis", "utf-8"]:
        try:
            with open(path, encoding=enc) as f:
                return list(csv.reader(f))
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise RuntimeError(f"エンコーディング自動検出失敗: {path}")


def safe_int(s):
    s = str(s).strip().replace(",", "")
    try:
        return int(s)
    except ValueError:
        return 0


# ============================================================
# P/L パーサー
# ============================================================
def parse_pl_structure(rows):
    """P/Lから構造化データを抽出"""
    header = rows[0]
    months = [h for h in header if h not in ("", "勘定科目", "補助科目", "合計")]
    total_col = header.index("合計") if "合計" in header else None

    # 全行スキャンして勘定科目別に金額を取得
    accounts = {}  # {勘定科目: {月: 金額}}
    subtotals = {}  # {合計行名: {月: 金額}}
    details = {}  # {(勘定科目, 補助科目): {月: 金額}}

    for row in rows[1:]:
        if not row or len(row) < 3:
            continue
        raw_acct = (row[0] or "").strip().lstrip("|")
        raw_sub = (row[1] or "").strip().lstrip("|") if len(row) > 1 else ""
        if not raw_acct:
            continue

        vals = {}
        for m in months:
            idx = header.index(m)
            if idx < len(row):
                vals[m] = safe_int(row[idx])
        total_val = safe_int(row[total_col]) if total_col and total_col < len(row) else None

        if "合計" in raw_acct or "利益" in raw_acct or "損益" in raw_acct:
            subtotals[raw_acct] = {"monthly": vals, "total": total_val}
        else:
            accounts[raw_acct] = {"monthly": vals, "total": total_val}
            if raw_sub:
                details[(raw_acct, raw_sub)] = {"monthly": vals, "total": total_val}

    return {"months": months, "accounts": accounts, "subtotals": subtotals, "details": details}


# ============================================================
# B/S パーサー
# ============================================================
def parse_bs_structure(rows):
    """B/Sから構造化データを抽出"""
    header = rows[0]
    months = [h for h in header if h not in ("", "勘定科目", "補助科目")]

    accounts = {}
    subtotals = {}
    details = {}

    for row in rows[1:]:
        if not row or len(row) < 3:
            continue
        raw_acct = (row[0] or "").strip().lstrip("|")
        raw_sub = (row[1] or "").strip().lstrip("|") if len(row) > 1 else ""
        if not raw_acct:
            continue

        vals = {}
        for m in months:
            idx = header.index(m) if m in header else None
            if idx and idx < len(row):
                vals[m] = safe_int(row[idx])

        if "合計" in raw_acct:
            subtotals[raw_acct] = vals
        else:
            accounts[raw_acct] = vals
            if raw_sub:
                details[(raw_acct, raw_sub)] = vals

    return {"months": months, "accounts": accounts, "subtotals": subtotals, "details": details}


# ============================================================
# 仕訳帳パーサー
# ============================================================
def parse_journal(rows):
    header = rows[0]
    all_entries = []
    for row in rows[1:]:
        if len(row) < 16:
            continue
        e = {
            "no": row[0], "date": row[1],
            "dr_acct": row[2], "dr_sub": row[3], "dr_dept": row[4], "dr_client": row[5],
            "dr_tax": row[6], "dr_inv": row[7], "dr_amt": safe_int(row[8]),
            "cr_acct": row[9], "cr_sub": row[10], "cr_dept": row[11], "cr_client": row[12],
            "cr_tax": row[13], "cr_inv": row[14], "cr_amt": safe_int(row[15]),
            "memo": row[16] if len(row) > 16 else "",
            "tag": row[17] if len(row) > 17 else "",
            "note": row[18] if len(row) > 18 else "",
        }
        all_entries.append(e)

    # 期首残高の識別: 同一取引Noの全行が「摘要空 + 期首日付 + 両側対象外」
    if not all_entries:
        return [], []
    first_date = min(e["date"] for e in all_entries if e["date"].strip())
    from collections import defaultdict as _dd
    by_no = _dd(list)
    for e in all_entries:
        by_no[e["no"]].append(e)

    opening_nos = set()
    for no, group in by_no.items():
        if len(group) < 1:
            continue
        all_first_date = all(e["date"] == first_date for e in group)
        all_empty_memo = all(not e["memo"].strip() for e in group)
        all_taisyogai = all(
            ("対象外" in e["dr_tax"] or not e["dr_tax"].strip())
            and ("対象外" in e["cr_tax"] or not e["cr_tax"].strip())
            for e in group
        )
        if all_first_date and all_empty_memo and all_taisyogai:
            opening_nos.add(no)

    opening = [e for e in all_entries if e["no"] in opening_nos]
    entries = [e for e in all_entries if e["no"] not in opening_nos]
    return opening, entries


# ============================================================
# 分析エンジン
# ============================================================
def analyze_pl(pl):
    """P/L分析：計算検証 + 月次推移 + 収益性分析"""
    months = pl["months"]
    st = pl["subtotals"]

    # 計算検証
    calc_checks = []
    check_pairs = [
        ("売上総利益", lambda m: st.get("売上高合計", {}).get("monthly", {}).get(m, 0) - st.get("売上原価合計", {}).get("monthly", {}).get(m, 0)),
        ("営業利益", lambda m: st.get("売上総利益", {}).get("monthly", {}).get(m, 0) - st.get("販売費及び一般管理費合計", {}).get("monthly", {}).get(m, 0)),
        ("経常利益", lambda m: st.get("営業利益", {}).get("monthly", {}).get(m, 0) + st.get("営業外収益合計", {}).get("monthly", {}).get(m, 0) - st.get("営業外費用合計", {}).get("monthly", {}).get(m, 0)),
    ]
    all_ok = True
    for name, calc_fn in check_pairs:
        if name not in st:
            continue
        for m in months:
            calc = calc_fn(m)
            actual = st[name]["monthly"].get(m, 0)
            ok = calc == actual
            if not ok:
                all_ok = False
            calc_checks.append({"month": m, "item": name, "calculated": calc, "actual": actual, "ok": ok})

    # 合計列検証
    total_checks = []
    for name, data in st.items():
        if data.get("total") is not None and "合計" not in name:
            month_sum = sum(data["monthly"].get(m, 0) for m in months)
            total_checks.append({"item": name, "month_sum": month_sum, "stated": data["total"], "ok": month_sum == data["total"]})

    # 販管費内訳合計
    sga_checks = []
    sga_total = st.get("販売費及び一般管理費合計", {}).get("monthly", {})
    sga_items = {}
    for acct, data in pl["accounts"].items():
        if acct in ("売上高",) or "合計" in acct or "利益" in acct:
            continue
        # 販管費に属する科目（売上高合計と売上原価合計の後の科目）
        for m in months:
            sga_items.setdefault(m, 0)
            sga_items[m] += data["monthly"].get(m, 0)

    # 月次推移テーブル
    monthly_table = []
    for m in months:
        sales = st.get("売上高合計", {}).get("monthly", {}).get(m, 0)
        sga = st.get("販売費及び一般管理費合計", {}).get("monthly", {}).get(m, 0)
        op = st.get("営業利益", {}).get("monthly", {}).get(m, 0)
        non_op_i = st.get("営業外収益合計", {}).get("monthly", {}).get(m, 0)
        non_op_e = st.get("営業外費用合計", {}).get("monthly", {}).get(m, 0)
        ordinary = st.get("経常利益", {}).get("monthly", {}).get(m, 0)
        sga_ratio = (sga / sales * 100) if sales else 0
        monthly_table.append({
            "month": m, "sales": sales, "sga": sga, "operating": op,
            "non_op_income": non_op_i, "non_op_expense": non_op_e,
            "ordinary": ordinary, "sga_ratio": round(sga_ratio, 1)
        })

    # 月次推移の解釈（決算整理月は比較対象から除外）
    interpretations = []
    is_kessan = lambda m: "決算" in m["month"] or "整理" in m["month"]
    compare_months = [m for m in monthly_table if not is_kessan(m)]
    if len(compare_months) >= 2:
        first = compare_months[0]
        last = compare_months[-1]
        if first["sales"] > 0:
            change = (last["sales"] - first["sales"]) / first["sales"] * 100
            if change < -20:
                interpretations.append(f"売上高が{first['month']}から{last['month']}にかけて{abs(change):.0f}%減少。原因の確認が必要。")
        if last["operating"] < 0:
            interpretations.append(f"{last['month']}は営業損失（{last['operating']:,}円）。販管費率{last['sga_ratio']}%。固定費（役員報酬・地代家賃等）が売上減少に対して下方硬直的。")

    # 販管費構成の分析
    sga_breakdown = []
    for acct, data in sorted(pl["accounts"].items()):
        total_amt = sum(data["monthly"].get(m, 0) for m in months)
        if total_amt > 0:
            sga_breakdown.append({"account": acct, "total": total_amt, "monthly": {m: data["monthly"].get(m, 0) for m in months}})
    sga_breakdown.sort(key=lambda x: -x["total"])

    return {
        "calc_checks": calc_checks,
        "total_checks": total_checks,
        "monthly_table": monthly_table,
        "interpretations": interpretations,
        "sga_breakdown": sga_breakdown[:10],
        "all_ok": all_ok,
    }


def analyze_bs(bs, pl):
    """B/S分析：バランス・マイナス残高・主要比率・滞留勘定・P/L整合"""
    months = bs["months"]
    st = bs["subtotals"]

    # 貸借バランス
    balance_checks = []
    asset_total = st.get("資産の部合計", {})
    liab_eq_total = st.get("負債・純資産の部合計", {})
    for m in months:
        a = asset_total.get(m, 0)
        le = liab_eq_total.get(m, 0)
        balance_checks.append({"month": m, "asset": a, "liab_equity": le, "ok": a == le})

    # マイナス残高（繰越利益剰余金・利益項目は正常にマイナスになり得るため除外）
    NEGATIVE_SKIP_KEYWORDS = ["繰越利益剰余金", "うち当期純利益", "当期純損益", "利益剰余金"]
    def _skip_negative(acct, sub):
        name = f"{acct}/{sub}" if sub else acct
        return any(kw in name for kw in NEGATIVE_SKIP_KEYWORDS)

    negatives = []
    for (acct, sub), vals in bs["details"].items():
        if _skip_negative(acct, sub):
            continue
        for m, v in vals.items():
            if v < 0:
                negatives.append({"account": acct, "sub": sub, "month": m, "amount": v})
    # 勘定科目レベルでもチェック
    for acct, vals in bs["accounts"].items():
        if "合計" in acct or _skip_negative(acct, ""):
            continue
        for m, v in vals.items():
            if v < 0 and not any(n["account"] == acct and n["month"] == m for n in negatives):
                negatives.append({"account": acct, "sub": "", "month": m, "amount": v})

    # マイナス残高の解釈
    neg_interpretations = []
    for n in negatives:
        name = f"{n['account']}/{n['sub']}" if n['sub'] else n['account']
        if "前払費用" in name:
            neg_interpretations.append(f"{name} ({n['month']}月: {n['amount']:,}円) — 前払費用への入金（前払い計上）が振替額に対して不足。実際の支払額と振替額の差異を確認する必要がある。")
        elif "売掛金" in name:
            neg_interpretations.append(f"{name} ({n['month']}月: {n['amount']:,}円) — 補助科目の割当漏れ、または入金消込の不整合の可能性。")
        elif "預り金" in name:
            neg_interpretations.append(f"{name} ({n['month']}月: {n['amount']:,}円) — 預り金の過大返金、または源泉税の納付超過の可能性。")
        elif "借入金" in name:
            neg_interpretations.append(f"{name} ({n['month']}月: {n['amount']:,}円) — 返済超過。借入残高と返済実績の照合が必要。")
        else:
            neg_interpretations.append(f"{name} ({n['month']}月: {n['amount']:,}円)")

    # 主要比率
    ca_total = st.get("流動資産合計", {})
    cl_total = st.get("流動負債合計", {})
    eq_total = st.get("純資産の部合計", st.get("株主資本合計", {}))
    ratios = []
    for m in months:
        ca = ca_total.get(m, 0)
        cl = cl_total.get(m, 0)
        eq = eq_total.get(m, 0)
        ta = asset_total.get(m, 0)
        cr = (ca / cl * 100) if cl else 0
        er = (eq / ta * 100) if ta else 0
        ratios.append({"month": m, "current_ratio": round(cr, 1), "equity_ratio": round(er, 1)})

    # 滞留勘定の検出
    stagnant = []
    for (acct, sub), vals in bs["details"].items():
        month_vals = [vals.get(m, 0) for m in months]
        if all(v == month_vals[0] and v >= STAGNANT_THRESHOLD for v in month_vals):
            stagnant.append({"account": acct, "sub": sub, "amount": month_vals[0], "months": len(months)})
        # 新規発生して滞留
        if len(month_vals) >= 2 and month_vals[0] == 0 and month_vals[-1] >= STAGNANT_THRESHOLD:
            if all(month_vals[i] <= month_vals[i+1] for i in range(len(month_vals)-1)):
                stagnant.append({"account": acct, "sub": sub, "amount": month_vals[-1], "months": len(months), "new": True})

    # 滞留勘定の解釈
    stagnant_interpretations = []
    for s in stagnant:
        name = f"{s['account']}/{s['sub']}" if s['sub'] else s['account']
        if "仮払金" in name:
            stagnant_interpretations.append(f"{name}: {s['amount']:,}円が{s['months']}ヶ月不変。実質的に役員貸付金の可能性が高い。勘定科目の見直しと認定利息の計上が必要。")
        elif "役員貸付金" in name:
            stagnant_interpretations.append(f"{name}: {s['amount']:,}円が回収未了。返済計画の策定と認定利息の計上が必要。税務調査で認定賞与とみなされるリスクあり。")
        elif "保険積立金" in name or "敷金" in name:
            stagnant_interpretations.append(f"{name}: {s['amount']:,}円（性質上、変動なしで問題なし）")
        else:
            stagnant_interpretations.append(f"{name}: {s['amount']:,}円が{s['months']}ヶ月不変。内容確認が必要。")

    # P/L純利益 ⇔ B/S繰越利益剰余金の整合
    pl_st = pl["subtotals"] if pl else {}
    pl_months = pl["months"] if pl else []
    retained = {}
    for acct, vals in bs["accounts"].items():
        if "繰越利益剰余金" in acct:
            retained = vals
            break
    # 期首繰越利益剰余金の推定（うち当期純利益から逆算）
    cum_pl = {}
    for (acct, sub), vals in bs["details"].items():
        if "うち当期純利益" in acct:
            cum_pl = vals

    pl_bs_checks = []
    if retained and cum_pl:
        for m in months:
            r = retained.get(m, 0)
            cp = cum_pl.get(m, 0)
            opening_retained = r - cp  # 期首 = 当月残高 - 累計PL
            pl_bs_checks.append({"month": m, "retained": r, "cum_pl": cp, "opening": opening_retained})

    # 減価償却の均等性
    dep_account = {}
    for acct, vals in bs["accounts"].items():
        if "工具器具備品" in acct or "建物" in acct:
            dep_account[acct] = vals
    dep_checks = []
    for acct, vals in dep_account.items():
        month_vals = [(m, vals.get(m, 0)) for m in months]
        if len(month_vals) >= 2:
            diffs = [month_vals[i][1] - month_vals[i+1][1] for i in range(len(month_vals)-1)]
            is_uniform = len(set(diffs)) <= 1
            dep_checks.append({"account": acct, "values": month_vals, "diffs": diffs, "uniform": is_uniform})

    return {
        "balance_checks": balance_checks,
        "negatives": negatives,
        "neg_interpretations": neg_interpretations,
        "ratios": ratios,
        "stagnant": stagnant,
        "stagnant_interpretations": stagnant_interpretations,
        "pl_bs_checks": pl_bs_checks,
        "dep_checks": dep_checks,
    }


def analyze_tax(entries):
    """消費税区分レビュー"""
    # 1. 勘定科目と税区分の整合性
    mismatches = []
    allowed_purchase_taxes = {"対象外", ""}
    for e in entries:
        for prefix in ["dr", "cr"]:
            acct = e[f"{prefix}_acct"]
            tax = e[f"{prefix}_tax"]
            is_purchase_side = "仕入" in str(tax)
            if acct in ACCOUNTS_MUST_BE_TAISYOGAI and tax not in allowed_purchase_taxes and not is_purchase_side:
                mismatches.append({
                    "date": e["date"], "no": e["no"], "account": acct,
                    "actual_tax": tax, "expected_tax": "対象外", "memo": e["memo"]
                })

    # 2. 地代家賃の税区分
    rent_entries = []
    for e in entries:
        if e["dr_acct"] == "地代家賃":
            rent_entries.append({
                "date": e["date"], "no": e["no"], "sub": e["dr_sub"],
                "tax": e["dr_tax"], "amount": e["dr_amt"], "memo": e["memo"]
            })

    # 3. インボイス対応
    inv_blank = 0
    inv_80_entries = []
    inv_80_total_tax = 0
    inv_80_total_denied = 0
    for e in entries:
        for prefix in ["dr", "cr"]:
            tax = e[f"{prefix}_tax"]
            inv = e[f"{prefix}_inv"]
            amt = e[f"{prefix}_amt"]
            if tax and "課税" in tax and "仕入" in tax:
                if not inv or inv.strip() == "":
                    inv_blank += 1
                elif "80" in inv:
                    if "10%" in tax:
                        tax_full = round(amt * 10 / 110)
                    elif "8%" in tax:
                        tax_full = round(amt * 8 / 108)
                    else:
                        tax_full = 0
                    tax_80 = round(tax_full * 0.8)
                    denied = tax_full - tax_80
                    inv_80_total_tax += tax_full
                    inv_80_total_denied += denied
                    inv_80_entries.append({
                        "date": e["date"], "no": e["no"],
                        "account": e[f"{prefix}_acct"], "sub": e[f"{prefix}_sub"],
                        "amount": amt, "tax_full": tax_full,
                        "tax_80": tax_80, "denied": denied, "memo": e["memo"]
                    })

    # 4. 売上側の税区分
    sales_tax = []
    for e in entries:
        if e["cr_acct"] == "売上高" and e["cr_tax"]:
            sales_tax.append(e["cr_tax"])
        if e["dr_acct"] == "売上高" and e["dr_tax"]:
            sales_tax.append(e["dr_tax"])

    # 5. 仮払・仮受消費税の推計
    karibarai_est = 0
    kariuke_est = 0
    for e in entries:
        for prefix in ["dr", "cr"]:
            tax = e[f"{prefix}_tax"]
            amt = e[f"{prefix}_amt"]
            inv = e[f"{prefix}_inv"]
            if not tax or not amt:
                continue
            if "課税仕入" in tax and "10%" in tax:
                t = round(amt * 10 / 110)
                if "80%" in str(inv):
                    t = round(t * 0.8)
                karibarai_est += t
            elif "課税仕入(軽)" in tax and "8%" in tax:
                karibarai_est += round(amt * 8 / 108)
            elif "課税売上" in tax and "10%" in tax:
                kariuke_est += round(amt * 10 / 110)

    # 6. 税区分の分布
    all_tax = []
    for e in entries:
        for prefix in ["dr", "cr"]:
            t = e[f"{prefix}_tax"]
            if t:
                all_tax.append(t)
    tax_distribution = dict(Counter(all_tax).most_common())

    # 非課税仕入/売上の内訳
    nontax_entries = []
    for e in entries:
        for prefix in ["dr", "cr"]:
            if e[f"{prefix}_tax"] and "非課税" in e[f"{prefix}_tax"]:
                nontax_entries.append({
                    "date": e["date"], "no": e["no"],
                    "account": e[f"{prefix}_acct"], "sub": e[f"{prefix}_sub"],
                    "tax": e[f"{prefix}_tax"], "amount": e[f"{prefix}_amt"],
                    "memo": e["memo"]
                })

    # --- 追加チェック ---

    # 大手企業なのに80%控除
    MAJOR_CORPS = ['ソフトバンク', 'NTT', 'ドコモ', 'KDDI', 'JR', '東日本旅客', '東海旅客', '西日本旅客',
                   '東京電力', '関西電力', '中部電力', '東北電力', '九州電力', '北海道電力',
                   '東京ガス', '大阪ガス', '札幌市交通局', '東京地下鉄', '東京メトロ', '大阪メトロ',
                   'ヤマト運輸', '佐川急便', '日本郵便']
    major_inv80 = []
    for e in entries:
        for prefix in ["dr", "cr"]:
            inv = e[f"{prefix}_inv"]
            if "80%" in str(inv):
                memo_up = e["memo"].upper()
                for mc in MAJOR_CORPS:
                    if mc.upper() in memo_up:
                        major_inv80.append({"date": e["date"], "no": e["no"], "account": e[f"{prefix}_acct"],
                                            "amount": e[f"{prefix}_amt"], "memo": e["memo"], "corp": mc})
                        break

    # 税還付が課税売上
    tax_refund_taxable = []
    for e in entries:
        for prefix in ["dr", "cr"]:
            acct = e[f"{prefix}_acct"]
            tax = e[f"{prefix}_tax"]
            if ("還付" in e["memo"] or "還付" in acct) and "課税売上" in str(tax):
                tax_refund_taxable.append({"date": e["date"], "no": e["no"], "account": acct,
                                           "tax": tax, "amount": e[f"{prefix}_amt"], "memo": e["memo"]})

    # 決済代行が売上先摘要
    PAYMENT_PROCS = ['STRIPE', 'ストライプ', 'SQUARE', 'スクエア', 'PAYPAL', 'ペイパル']
    payment_as_sales = []
    for e in entries:
        for prefix in ["dr", "cr"]:
            acct = e[f"{prefix}_acct"]
            if "売上" in acct:
                memo_up = e["memo"].upper()
                for pp in PAYMENT_PROCS:
                    if pp.upper() in memo_up:
                        payment_as_sales.append({"date": e["date"], "no": e["no"], "account": acct,
                                                 "amount": e[f"{prefix}_amt"], "memo": e["memo"], "processor": pp})
                        break

    # リバースチャージ判定（海外SaaS）— インボイス登録状況を付与
    reverse_charge = []
    rc_accts = ('通信費', '支払手数料', '広告宣伝費', '研究開発費', '雑費', '消耗品費')
    for e in entries:
        for prefix in ["dr", "cr"]:
            acct = e[f"{prefix}_acct"]
            tax = e[f"{prefix}_tax"]
            if acct in rc_accts and "課税仕入" in str(tax):
                memo_up = e["memo"].upper()
                for saas, info in OVERSEAS_SAAS_INVOICE.items():
                    if saas in memo_up:
                        entry = {"date": e["date"], "no": e["no"], "account": acct,
                                 "tax": tax, "amount": e[f"{prefix}_amt"],
                                 "memo": e["memo"], "saas": saas}
                        if info:
                            entry["registered"] = True
                            entry["invoice_no"] = info["no"]
                            entry["registered_name"] = info["name"]
                        else:
                            entry["registered"] = False
                        reverse_charge.append(entry)
                        break

    # 切手が非課税仕入
    stamp_nontax = []
    for e in entries:
        for prefix in ["dr", "cr"]:
            tax = e[f"{prefix}_tax"]
            if "切手" in e["memo"] and "非課税" in str(tax):
                stamp_nontax.append({"date": e["date"], "no": e["no"], "account": e[f"{prefix}_acct"],
                                     "tax": tax, "amount": e[f"{prefix}_amt"], "memo": e["memo"]})

    # 前受金振替の摘要が「残高振替」
    ukekin_bad_memo = []
    for e in entries:
        if (e["dr_acct"] == "前受金" or e["cr_acct"] == "前受金") and "残高振替" in e["memo"]:
            ukekin_bad_memo.append({"date": e["date"], "no": e["no"], "memo": e["memo"],
                                    "amount": e["dr_amt"] if e["dr_acct"] == "前受金" else e["cr_amt"]})

    # インボイス80%控除0件チェック
    has_taxable_purchase = any("課税仕入" in str(e["dr_tax"]) for e in entries)
    inv80_zero = has_taxable_purchase and len(inv_80_entries) == 0

    return {
        "mismatches": mismatches,
        "rent_entries": rent_entries,
        "inv_blank_count": inv_blank,
        "inv_80_entries": inv_80_entries,
        "inv_80_total_tax": inv_80_total_tax,
        "inv_80_total_denied": inv_80_total_denied,
        "sales_tax": dict(Counter(sales_tax)),
        "karibarai_est": karibarai_est,
        "kariuke_est": kariuke_est,
        "tax_distribution": tax_distribution,
        "nontax_entries": nontax_entries,
        "major_inv80": major_inv80,
        "tax_refund_taxable": tax_refund_taxable,
        "payment_as_sales": payment_as_sales,
        "reverse_charge": reverse_charge,
        "stamp_nontax": stamp_nontax,
        "ukekin_bad_memo": ukekin_bad_memo,
        "inv80_zero": inv80_zero,
    }


def analyze_journal(entries, opening):
    """仕訳帳レビュー"""
    # 1. 重複仕訳（同日・同一金額で検出）
    dup_key = defaultdict(list)
    for e in entries:
        key = (e["date"], e["dr_amt"], e["cr_amt"])
        dup_key[key].append(e)
    duplicates = []
    for k, group in dup_key.items():
        if len(group) > 1:
            amt = max(k[1] or 0, k[2] or 0)
            if amt < 1000:
                continue
            first = group[0]
            duplicates.append({
                "date": k[0], "dr_acct": first["dr_acct"], "dr_sub": first["dr_sub"],
                "cr_acct": first["cr_acct"], "cr_sub": first["cr_sub"],
                "dr_amt": k[1], "cr_amt": k[2], "memo": first["memo"],
                "nos": [e["no"] for e in group], "count": len(group)
            })

    # 2. 金額異常値
    acct_amounts = defaultdict(list)
    for e in entries:
        if e["dr_acct"] and e["dr_amt"]:
            acct_amounts[e["dr_acct"]].append((e["dr_amt"], e))
        if e["cr_acct"] and e["cr_amt"]:
            acct_amounts[e["cr_acct"]].append((e["cr_amt"], e))
    anomalies = []
    for acct, items in sorted(acct_amounts.items()):
        if len(items) < 3:
            continue
        amounts = [i[0] for i in items]
        avg = sum(amounts) / len(amounts)
        if avg == 0:
            continue
        for amt, e in items:
            if amt > avg * 5 and amt > 100000:
                anomalies.append({
                    "account": acct, "date": e["date"], "no": e["no"],
                    "amount": amt, "average": round(avg), "ratio": round(amt / avg, 1),
                    "memo": e["memo"]
                })

    # 3. 摘要不備
    no_memo = [e for e in entries if not e["memo"] or e["memo"].strip() == ""]
    short_memo = []
    for e in entries:
        if e["memo"] and 0 < len(e["memo"]) <= 3:
            short_memo.append({
                "date": e["date"], "no": e["no"], "memo": e["memo"],
                "dr_acct": e["dr_acct"], "cr_acct": e["cr_acct"]
            })

    # 4. 会議費/接待交際費の区分
    kaigi_all = [e for e in entries if e["dr_acct"] == "会議費"]
    kaigi_high = []
    for e in kaigi_all:
        if e["dr_amt"] >= ENTERTAINMENT_THRESHOLD:
            kaigi_high.append({
                "date": e["date"], "no": e["no"], "amount": e["dr_amt"], "memo": e["memo"]
            })
    settai = []
    for e in entries:
        if e["dr_acct"] == "接待交際費":
            settai.append({
                "date": e["date"], "no": e["no"], "amount": e["dr_amt"], "memo": e["memo"]
            })

    # 5. 事業関連性
    personal = []
    seen = set()
    for e in entries:
        if e["dr_sub"] == "子供関連" or e["cr_sub"] == "子供関連":
            key = (e["date"], e["no"])
            if key not in seen:
                seen.add(key)
                personal.append({
                    "date": e["date"], "no": e["no"],
                    "account": e["dr_acct"], "sub": e["dr_sub"],
                    "amount": e["dr_amt"], "memo": e["memo"], "type": "補助科目"
                })
        elif e["memo"]:
            for kw in PERSONAL_KEYWORDS:
                if kw in e["memo"]:
                    key = (e["date"], e["no"])
                    if key not in seen:
                        seen.add(key)
                        personal.append({
                            "date": e["date"], "no": e["no"],
                            "account": e["dr_acct"], "sub": e["dr_sub"],
                            "amount": e["dr_amt"], "memo": e["memo"], "type": "摘要"
                        })
                    break

    # 6. 月次振替の整合性
    fixed_accounts = ["役員報酬", "法定福利費", "地代家賃", "減価償却費"]
    monthly_fixed = {}
    for acct in fixed_accounts:
        monthly = defaultdict(int)
        for e in entries:
            if e["dr_acct"] == acct:
                m = e["date"][:7]
                monthly[m] += e["dr_amt"]
        if monthly:
            vals = list(monthly.values())
            monthly_fixed[acct] = {
                "monthly": dict(sorted(monthly.items())),
                "uniform": len(set(vals)) == 1,
                "amount": vals[0] if len(set(vals)) == 1 else None
            }

    # 7. 期首残高の貸借一致
    opening_dr = sum(e["dr_amt"] for e in opening)
    opening_cr = sum(e["cr_amt"] for e in opening)

    # 8. 全取引の貸借一致
    tx_groups = defaultdict(list)
    for e in entries:
        tx_groups[e["no"]].append(e)
    total_dr = 0
    total_cr = 0
    imbalanced = []
    for no, group in tx_groups.items():
        dr_sum = sum(e["dr_amt"] for e in group)
        cr_sum = sum(e["cr_amt"] for e in group)
        total_dr += dr_sum
        total_cr += cr_sum
        if dr_sum != cr_sum:
            imbalanced.append({"no": no, "date": group[0]["date"], "dr": dr_sum, "cr": cr_sum})

    # 9. 仮払金の分析
    karibarai = defaultdict(lambda: {"count": 0, "total": 0, "entries": []})
    for e in entries:
        if e["dr_acct"] == "仮払金":
            sub = e["dr_sub"] or "補助科目なし"
            karibarai[sub]["count"] += 1
            karibarai[sub]["total"] += e["dr_amt"]
            if e["dr_amt"] >= 100000:
                karibarai[sub]["entries"].append({
                    "date": e["date"], "no": e["no"],
                    "amount": e["dr_amt"], "memo": e["memo"]
                })

    # 10. 仮受金の分析
    kariuke = []
    for e in entries:
        if e["cr_acct"] == "仮受金":
            kariuke.append({
                "date": e["date"], "no": e["no"], "amount": e["cr_amt"],
                "memo": e["memo"], "side": "cr"
            })
        if e["dr_acct"] == "仮受金":
            kariuke.append({
                "date": e["date"], "no": e["no"], "amount": e["dr_amt"],
                "memo": e["memo"], "side": "dr"
            })

    # 11. 役員貸付金
    yakuin_kashitsuke = []
    for e in entries:
        if e["dr_acct"] == "役員貸付金" or e["cr_acct"] == "役員貸付金":
            yakuin_kashitsuke.append({
                "date": e["date"], "no": e["no"],
                "dr_acct": e["dr_acct"], "dr_sub": e["dr_sub"], "dr_amt": e["dr_amt"],
                "cr_acct": e["cr_acct"], "cr_sub": e["cr_sub"], "cr_amt": e["cr_amt"],
                "memo": e["memo"]
            })

    return {
        "entry_count": len(entries),
        "opening_count": len(opening),
        "duplicates": duplicates,
        "anomalies": anomalies,
        "no_memo_count": len(no_memo),
        "short_memo": short_memo,
        "kaigi_total": len(kaigi_all),
        "kaigi_high": kaigi_high,
        "settai": settai,
        "personal": personal,
        "monthly_fixed": monthly_fixed,
        "opening_balance": {"dr": opening_dr, "cr": opening_cr, "ok": opening_dr == opening_cr},
        "total_balance": {"dr": total_dr, "cr": total_cr, "ok": total_dr == total_cr},
        "imbalanced": imbalanced,
        "karibarai": dict(karibarai),
        "kariuke": kariuke,
        "yakuin_kashitsuke": yakuin_kashitsuke,
    }


def analyze_cross(entries, bs):
    """クロスチェック"""
    findings = []

    # 1. 地代家賃（非課税仕入）⇔ 社宅家賃（非課税売上）
    rent_nontax = [e for e in entries if e["dr_acct"] == "地代家賃" and "非課税" in str(e["dr_tax"])]
    housing_income = [e for e in entries
                      for prefix in ["cr", "dr"]
                      if e[f"{prefix}_acct"] == "雑収入"
                      and "非課税売上" in str(e[f"{prefix}_tax"])
                      and ("家賃" in e["memo"] or "社宅" in e["memo"])]
    nontax_income_all = [e for e in entries
                         for prefix in ["cr", "dr"]
                         if e[f"{prefix}_acct"] == "雑収入"
                         and "非課税売上" in str(e[f"{prefix}_tax"])]

    if rent_nontax and not nontax_income_all:
        rent_detail = [{"date": e["date"], "sub": e["dr_sub"], "amount": e["dr_amt"]} for e in rent_nontax]
        findings.append({
            "id": "rent_housing",
            "priority": "高",
            "title": "地代家賃（非課税仕入）と社宅家賃（非課税売上）の不整合",
            "rent_entries": rent_detail,
            "housing_income": [],
            "nontax_income_all": [],
            "has_housing": False,
            "interpretation": (
                "地代家賃に非課税仕入（居住用賃借）があるが、対応する社宅家賃の雑収入（非課税売上）が計上されていない。"
                "社宅として役員に貸与している場合、家賃の一部を役員から収受し雑収入（非課税売上）として計上する必要がある。"
                "収受がない場合、役員への経済的利益の供与（現物給与）とみなされ、源泉徴収の対象となる可能性がある。"
            )
        })

    # 2. 仮払金の大口分析（役員個人口座への振込等）
    large_karibarai = []
    for e in entries:
        if e["dr_acct"] == "仮払金" and e["dr_amt"] >= 5000000:
            large_karibarai.append({
                "date": e["date"], "no": e["no"], "sub": e["dr_sub"],
                "amount": e["dr_amt"], "memo": e["memo"]
            })
    if large_karibarai:
        total = sum(x["amount"] for x in large_karibarai)
        findings.append({
            "id": "large_karibarai",
            "priority": "高",
            "title": f"仮払金の大口支出（合計{total:,}円）",
            "entries": large_karibarai,
            "interpretation": (
                "役員個人口座への大口送金が仮払金として処理されている場合、実質的には役員貸付金であり、"
                "勘定科目の振替と認定利息の計上（特例基準割合または市場金利）が必要。"
                "税務調査で認定賞与とみなされるリスクがある。"
            )
        })

    # 3. 仮受金の未整理
    kariuke_entries = [e for e in entries if e["cr_acct"] == "仮受金"]
    if kariuke_entries:
        kariuke_detail = [{"date": e["date"], "no": e["no"], "amount": e["cr_amt"], "memo": e["memo"]} for e in kariuke_entries]
        findings.append({
            "id": "kariuke",
            "priority": "高",
            "title": f"仮受金の未整理（{len(kariuke_entries)}件）",
            "entries": kariuke_detail,
            "interpretation": "仮受金は一時的な勘定であり、内容確認のうえ速やかに適切な科目（売上高、有価証券売却益、預り金等）へ振替が必要。期末までに整理されていない場合、税務上の問題となる可能性がある。"
        })

    # 4. 前払費用のマイナス推移
    for (acct, sub), vals in bs.get("details", {}).items():
        if "前払費用" in acct:
            months = sorted(vals.keys())
            month_vals = [vals[m] for m in months]
            if any(v < 0 for v in month_vals):
                diffs = [month_vals[i+1] - month_vals[i] for i in range(len(month_vals)-1)]
                findings.append({
                    "id": f"negative_prepaid_{sub}",
                    "priority": "中",
                    "title": f"前払費用/{sub}のマイナス残高",
                    "values": {m: v for m, v in zip(months, month_vals)},
                    "interpretation": f"毎月の振替額が前払い計上額を上回っている。実際の支払額と会計上の振替額の差異を確認し、修正仕訳を行う必要がある。"
                })

    # 5. 役員長期借入金の動き
    yakuin_kariage = [e for e in entries if "役員長期借入金" in e["dr_acct"] or "役員長期借入金" in e["cr_acct"]]
    if yakuin_kariage:
        findings.append({
            "id": "yakuin_kariage",
            "priority": "低",
            "title": "役員長期借入金の動き",
            "entries": [{
                "date": e["date"], "no": e["no"],
                "dr": f"{e['dr_acct']}/{e['dr_sub']}" if e["dr_acct"] else "",
                "dr_amt": e["dr_amt"],
                "cr": f"{e['cr_acct']}/{e['cr_sub']}" if e["cr_acct"] else "",
                "cr_amt": e["cr_amt"],
                "memo": e["memo"]
            } for e in yakuin_kariage],
            "interpretation": "役員報酬の差引支給額が貸方に計上され、不定期に返済（借方）が発生する形。残高が小さいため大きな問題ではないが、マイナス残高（返済超過）にならないよう注意。"
        })

    return {"findings": findings}


def generate_action_items(pl_result, bs_result, tax_result, journal_result, cross_result):
    """対応事項一覧を生成"""
    actions = []
    priority_order = {"高": 0, "中": 1, "低": 2}

    # クロスチェックのfindingsから
    for f in cross_result.get("findings", []):
        actions.append({
            "priority": f["priority"],
            "title": f["title"],
            "impact": "",
        })

    # 役員貸付金
    if journal_result.get("yakuin_kashitsuke"):
        total = sum(e["dr_amt"] for e in journal_result["yakuin_kashitsuke"] if e["dr_acct"] == "役員貸付金")
        if total > 0:
            actions.append({
                "priority": "高",
                "title": f"役員貸付金{total:,}円の返済計画策定と認定利息計上",
                "impact": f"{total:,}円",
            })

    # 重複仕訳
    if journal_result.get("duplicates"):
        actions.append({
            "priority": "中",
            "title": f"重複仕訳の確認（{len(journal_result['duplicates'])}ケース）",
            "impact": "少額",
        })

    # 会議費の高額
    if journal_result.get("kaigi_high"):
        actions.append({
            "priority": "中",
            "title": f"会議費{ENTERTAINMENT_THRESHOLD:,}円以上（{len(journal_result['kaigi_high'])}件）の参加人数確認と接待交際費振替要否",
            "impact": "不明",
        })

    # 事業関連性
    if journal_result.get("personal"):
        total = sum(p["amount"] for p in journal_result["personal"])
        actions.append({
            "priority": "中",
            "title": f"事業関連性要確認（{len(journal_result['personal'])}件、合計{total:,}円）",
            "impact": f"{total:,}円",
        })

    # マイナス残高（利益系・保険・敷金は除外）
    if bs_result.get("negatives"):
        for n in bs_result["negatives"]:
            name = f"{n['account']}/{n['sub']}" if n['sub'] else n['account']
            if "保険" in name or "敷金" in name or "利益" in name:
                continue
            actions.append({
                "priority": "中",
                "title": f"{name}のマイナス残高（{n['month']}月: {n['amount']:,}円）の原因調査",
                "impact": f"{n['amount']:,}円",
            })

    # 税区分の不整合
    if tax_result.get("mismatches"):
        actions.append({
            "priority": "低",
            "title": f"税区分の不整合修正（{len(tax_result['mismatches'])}件）",
            "impact": "なし",
        })

    # 摘要不備
    if journal_result.get("short_memo"):
        actions.append({
            "priority": "低",
            "title": f"短い摘要の詳細化（{len(journal_result['short_memo'])}件）",
            "impact": "なし",
        })

    # --- 追加チェック項目 ---

    # 大手企業80%控除
    if tax_result.get("major_inv80"):
        cnt = len(tax_result["major_inv80"])
        actions.append({
            "priority": "高",
            "title": f"大手企業が80%控除（{cnt}件）— 適格請求書発行事業者のはず",
            "impact": "要修正",
        })

    # 税還付が課税売上
    if tax_result.get("tax_refund_taxable"):
        cnt = len(tax_result["tax_refund_taxable"])
        total = sum(e["amount"] for e in tax_result["tax_refund_taxable"])
        actions.append({
            "priority": "高",
            "title": f"税金還付が課税売上になっている（{cnt}件、{total:,}円）",
            "impact": f"{total:,}円",
        })

    # 決済代行が売上先
    if tax_result.get("payment_as_sales"):
        cnt = len(tax_result["payment_as_sales"])
        actions.append({
            "priority": "中",
            "title": f"決済代行会社が売上先摘要（{cnt}件）— 実際の取引先を記載すべき",
            "impact": "なし",
        })

    # リバースチャージ（海外SaaS）
    if tax_result.get("reverse_charge"):
        rc = tax_result["reverse_charge"]
        registered = [e for e in rc if e.get("registered")]
        unconfirmed = [e for e in rc if not e.get("registered")]
        if registered:
            cnt_r = len(registered)
            total_r = sum(e["amount"] for e in registered)
            actions.append({
                "priority": "低",
                "title": f"海外SaaS（インボイス登録済）のリバチャ適用確認（{cnt_r}件、{total_r:,}円）",
                "impact": f"{total_r:,}円",
            })
        if unconfirmed:
            cnt_u = len(unconfirmed)
            total_u = sum(e["amount"] for e in unconfirmed)
            actions.append({
                "priority": "中",
                "title": f"海外SaaS等のリバチャ未判定・登録未確認（{cnt_u}件、{total_u:,}円）",
                "impact": f"{total_u:,}円",
            })

    # 切手が非課税
    if tax_result.get("stamp_nontax"):
        cnt = len(tax_result["stamp_nontax"])
        actions.append({
            "priority": "中",
            "title": f"切手購入が非課税仕入（{cnt}件）— 購入時課税or使用時振替が必要",
            "impact": "要修正",
        })

    # 前受金振替摘要不備
    if tax_result.get("ukekin_bad_memo"):
        cnt = len(tax_result["ukekin_bad_memo"])
        actions.append({
            "priority": "中",
            "title": f"前受金振替の摘要が「残高振替」（{cnt}件）— 内容記載が必要",
            "impact": "なし",
        })

    # インボイス80%控除0件
    if tax_result.get("inv80_zero"):
        actions.append({
            "priority": "中",
            "title": "インボイス80%控除が0件 — 非適格事業者のチェック漏れの可能性",
            "impact": "不明",
        })

    # ソートして番号付与
    actions.sort(key=lambda x: priority_order.get(x["priority"], 9))
    for i, a in enumerate(actions, 1):
        a["no"] = i

    return actions


# ============================================================
# メイン
# ============================================================
def main():
    if len(sys.argv) < 2:
        print("使い方: python analyze.py <会社フォルダのパス>")
        sys.exit(1)

    folder = sys.argv[1]
    if not os.path.isdir(folder):
        print(f"エラー: フォルダが見つかりません: {folder}")
        sys.exit(1)

    company_name = os.path.basename(folder)
    print(f"{'='*60}")
    print(f" 経理レビュー: {company_name}")
    print(f"{'='*60}")

    pl_path = find_csv(folder, "損益計算書")
    bs_path = find_csv(folder, "貸借対照表")
    journal_path = find_csv(folder, "仕訳帳")
    print(f"P/L: {os.path.basename(pl_path)}")
    print(f"B/S: {os.path.basename(bs_path)}")
    print(f"仕訳帳: {os.path.basename(journal_path)}")

    pl_rows = read_csv_rows(pl_path)
    bs_rows = read_csv_rows(bs_path)
    journal_rows = read_csv_rows(journal_path)

    pl = parse_pl_structure(pl_rows)
    bs = parse_bs_structure(bs_rows)
    opening, entries = parse_journal(journal_rows)

    print(f"仕訳数: {len(entries)}件（期首残高: {len(opening)}行）")

    # 分析実行
    pl_result = analyze_pl(pl)
    bs_result = analyze_bs(bs, pl)
    tax_result = analyze_tax(entries)
    journal_result = analyze_journal(entries, opening)
    cross_result = analyze_cross(entries, bs)
    action_items = generate_action_items(pl_result, bs_result, tax_result, journal_result, cross_result)

    # 構造化出力
    output = {
        "company_name": company_name,
        "months": pl["months"],
        "pl": pl_result,
        "bs": bs_result,
        "tax": tax_result,
        "journal": journal_result,
        "cross": cross_result,
        "action_items": action_items,
    }

    json_path = os.path.join(folder, "review_result.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n分析結果を保存: {json_path}")

    # サマリー出力
    print(f"\n{'='*60}")
    print(" サマリー")
    print(f"{'='*60}")
    print(f"  P/L計算検証: {'全OK' if pl_result['all_ok'] else 'NG検出'}")
    print(f"  B/Sバランス: {'全OK' if all(b['ok'] for b in bs_result['balance_checks']) else 'NG検出'}")
    print(f"  マイナス残高: {len(bs_result['negatives'])}件")
    print(f"  滞留勘定: {len(bs_result['stagnant'])}件")
    print(f"  税区分不整合: {len(tax_result['mismatches'])}件")
    print(f"  80%控除: {len(tax_result['inv_80_entries'])}件（否認額合計{tax_result['inv_80_total_denied']:,}円）")
    print(f"  重複仕訳: {len(journal_result['duplicates'])}件")
    print(f"  金額異常値: {len(journal_result['anomalies'])}件")
    print(f"  会議費1万円以上: {len(journal_result['kaigi_high'])}件")
    print(f"  事業関連性要確認: {len(journal_result['personal'])}件")
    print(f"  クロスチェック指摘: {len(cross_result['findings'])}件")
    print(f"  対応事項: {len(action_items)}件（高: {sum(1 for a in action_items if a['priority']=='高')}, 中: {sum(1 for a in action_items if a['priority']=='中')}, 低: {sum(1 for a in action_items if a['priority']=='低')}）")


if __name__ == "__main__":
    main()
