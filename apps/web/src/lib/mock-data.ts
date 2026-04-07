// SevenBoard モックデータ

export const kpiData = {
  revenue: {
    title: "売上高",
    value: 12500,
    unit: "万円",
    monthOverMonth: 5.2,
    budgetRatio: 98.5,
  },
  operatingProfit: {
    title: "営業利益",
    value: 2800,
    unit: "万円",
    monthOverMonth: -2.1,
    budgetRatio: 92.3,
  },
  cashflow: {
    title: "営業CF",
    value: 1500,
    unit: "万円",
    monthOverMonth: 12.8,
    budgetRatio: 105.2,
  },
  runway: {
    title: "ランウェイ",
    value: 18.5,
    unit: "か月",
    monthOverMonth: 0.3,
    budgetRatio: 100,
  },
};

export const revenueChartData = [
  { month: "4月", actual: 10200, budget: 10000 },
  { month: "5月", actual: 10800, budget: 10500 },
  { month: "6月", actual: 11200, budget: 11000 },
  { month: "7月", actual: 10900, budget: 11200 },
  { month: "8月", actual: 11500, budget: 11500 },
  { month: "9月", actual: 11800, budget: 11800 },
  { month: "10月", actual: 12100, budget: 12000 },
  { month: "11月", actual: 11900, budget: 12200 },
  { month: "12月", actual: 12800, budget: 12500 },
  { month: "1月", actual: 12200, budget: 12500 },
  { month: "2月", actual: 11800, budget: 12800 },
  { month: "3月", actual: 12500, budget: 12700 },
];

export const aiSummary = {
  title: "AIサマリー",
  content:
    "売上高は前月比 5.2% の増加で、計画線にほぼ沿って推移しています。一方で営業利益は前月比 2.1pt の低下となっており、評価損失の発生に人件費増加 8.3% が影響しています。キャッシュフローは堅調で、ランウェイは 18.5 か月を維持しています。翌月は販管費の抑制と採用計画の見直しが重要です。",
  generatedAt: "2026-04-05 09:00",
};

export const alerts = [
  {
    id: 1,
    level: "warning" as const,
    title: "評価損失が予算超過",
    description:
      "評価損失が予算比 108% に達しています。主因は人件費増加 8.3% です。",
    date: "2026-04-05",
  },
  {
    id: 2,
    level: "info" as const,
    title: "売上構成比の変動",
    description:
      "A社向け売上構成比が 35% まで上昇しています。依存度が高まっているため注意が必要です。",
    date: "2026-04-04",
  },
  {
    id: 3,
    level: "critical" as const,
    title: "資金残高に注意",
    description:
      "来月に大型投資予定 2,000 万円があり、一時的に資金余力が低下する見込みです。",
    date: "2026-04-03",
  },
];

export const varianceData = [
  { category: "売上高", budget: 12700, actual: 12500, variance: -200, ratio: -1.6, priorYear: 11800 },
  { category: "売上原価", budget: 7600, actual: 7400, variance: 200, ratio: 2.6, priorYear: 7200 },
  { category: "売上総利益", budget: 5100, actual: 5100, variance: 0, ratio: 0.0, priorYear: 4600 },
  { category: "販管費", budget: 2200, actual: 2300, variance: -100, ratio: -4.5, priorYear: 2100 },
  { category: "  人件費", budget: 1500, actual: 1625, variance: -125, ratio: -8.3, priorYear: 1400 },
  { category: "  広告宣伝費", budget: 300, actual: 280, variance: 20, ratio: 6.7, priorYear: 250 },
  { category: "  その他販管費", budget: 400, actual: 395, variance: 5, ratio: 1.3, priorYear: 450 },
  { category: "営業利益", budget: 2900, actual: 2800, variance: -100, ratio: -3.4, priorYear: 2500 },
  { category: "営業外収益", budget: 50, actual: 60, variance: 10, ratio: 20.0, priorYear: 45 },
  { category: "営業外費用", budget: 100, actual: 90, variance: 10, ratio: 10.0, priorYear: 110 },
  { category: "経常利益", budget: 2850, actual: 2770, variance: -80, ratio: -2.8, priorYear: 2435 },
];

export const cashflowData = {
  months: ["1月", "2月", "3月", "4月", "5月", "6月"],
  rows: [
    {
      category: "営業収入",
      values: [15000, 15500, 16200, 16800, 17300, 17800],
      isTotal: true,
    },
    {
      category: "【収入の部】",
      values: [null, null, null, null, null, null],
      isHeader: true,
    },
    { category: "  売上入金", values: [11800, 12200, 12500, 12800, 12500, 12700] },
    { category: "  その他収入", values: [200, 150, 300, 250, 200, 180] },
    { category: "収入合計", values: [12000, 12350, 12800, 13050, 12700, 12880], isTotal: true },
    {
      category: "【支出の部】",
      values: [null, null, null, null, null, null],
      isHeader: true,
    },
    { category: "  仕入・外注費", values: [6500, 6800, 7100, 7200, 7000, 7100] },
    { category: "  人件費", values: [3200, 3200, 3400, 3500, 3500, 3500] },
    { category: "  家賃", values: [800, 800, 800, 800, 800, 800] },
    { category: "  その他支出", values: [1000, 850, 900, 1050, 900, 950] },
    { category: "支出合計", values: [11500, 11650, 12200, 12550, 12200, 12350], isTotal: true },
    {
      category: "収支差額",
      values: [500, 700, 600, 500, 500, 530],
      isTotal: true,
      isDiff: true,
    },
    {
      category: "期末残高",
      values: [15500, 16200, 16800, 17300, 17800, 18330],
      isTotal: true,
    },
  ],
};

export const budgetData = [
  { id: "1", category: "売上高", apr: 12700, may: 13000, jun: 13200, jul: 13500, aug: 13000, sep: 13500, oct: 13800, nov: 14000, dec: 14500, jan: 13200, feb: 13000, mar: 14000 },
  { id: "2", category: "売上原価", apr: 7600, may: 7800, jun: 7900, jul: 8100, aug: 7800, sep: 8100, oct: 8300, nov: 8400, dec: 8700, jan: 7900, feb: 7800, mar: 8400 },
  { id: "3", category: "売上総利益", apr: 5100, may: 5200, jun: 5300, jul: 5400, aug: 5200, sep: 5400, oct: 5500, nov: 5600, dec: 5800, jan: 5300, feb: 5200, mar: 5600 },
  { id: "4", category: "販管費", apr: 2200, may: 2250, jun: 2300, jul: 2300, aug: 2250, sep: 2300, oct: 2350, nov: 2350, dec: 2400, jan: 2300, feb: 2250, mar: 2350 },
  { id: "5", category: "  人件費", apr: 1500, may: 1550, jun: 1550, jul: 1600, aug: 1550, sep: 1600, oct: 1600, nov: 1600, dec: 1650, jan: 1550, feb: 1550, mar: 1600 },
  { id: "6", category: "  広告宣伝費", apr: 300, may: 300, jun: 350, jul: 300, aug: 300, sep: 300, oct: 350, nov: 350, dec: 350, jan: 350, feb: 300, mar: 350 },
  { id: "7", category: "  その他", apr: 400, may: 400, jun: 400, jul: 400, aug: 400, sep: 400, oct: 400, nov: 400, dec: 400, jan: 400, feb: 400, mar: 400 },
  { id: "8", category: "営業利益", apr: 2900, may: 2950, jun: 3000, jul: 3100, aug: 2950, sep: 3100, oct: 3150, nov: 3250, dec: 3400, jan: 3000, feb: 2950, mar: 3250 },
];
