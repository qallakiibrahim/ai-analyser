import {
  ProductionRow,
  SpecLimits,
  StatsResult,
  calculateStats,
  detectAnomalies,
  extractMetricValues,
  suggestSpecLimits,
} from './stats';

// --- Exact Numerical Helpers (Lanczos Log-Gamma + Lentz Incomplete Beta + Acklam InvNorm) ---

function logGamma(z: number): number {
  const coeffs = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < coeffs.length; j++) {
    y += 1;
    ser += coeffs[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function studentTTwoTailedP(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  const x = df / (df + t * t);
  return Math.max(0, Math.min(1, regularizedIncompleteBeta(x, df / 2, 0.5)));
}

export function fDistUpperTailP(f: number, df1: number, df2: number): number {
  if (!Number.isFinite(f) || f <= 0 || df1 <= 0 || df2 <= 0) return 1;
  const x = df2 / (df2 + df1 * f);
  return Math.max(0, Math.min(1, regularizedIncompleteBeta(x, df2 / 2, df1 / 2)));
}

/**
 * Acklam's rational approximation for inverse standard normal CDF Φ⁻¹(p).
 */
export function inverseNormalCDF(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

// --- 1. Non-Normal Capability (ISO 22514-2 Percentile Method) & Q-Q Plot ---

export interface NonNormalCapability {
  pp: number | null;
  ppk: number | null;
  p0135: number;
  median: number;
  p99865: number;
  methodName: string;
}

export function calculateNonNormalCapability(
  values: number[],
  usl: number,
  lsl: number
): NonNormalCapability {
  if (values.length < 5 || usl <= lsl) {
    return {
      pp: null,
      ppk: null,
      p0135: 0,
      median: 0,
      p99865: 0,
      methodName: 'ISO 22514 Percentil (0.135% / 50% / 99.865%)',
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const p0135 = quantile(sorted, 0.00135);
  const median = quantile(sorted, 0.5);
  const p99865 = quantile(sorted, 0.99865);

  const spread = p99865 - p0135;
  const upperSpread = p99865 - median;
  const lowerSpread = median - p0135;

  const pp = spread > 1e-12 ? (usl - lsl) / spread : null;
  const ppu = upperSpread > 1e-12 ? (usl - median) / upperSpread : null;
  const ppl = lowerSpread > 1e-12 ? (median - lsl) / lowerSpread : null;
  const ppk = ppu !== null && ppl !== null ? Math.min(ppu, ppl) : null;

  return {
    pp,
    ppk,
    p0135,
    median,
    p99865,
    methodName: 'ISO 22514 Percentil (0.135% / 50% / 99.865%)',
  };
}

export interface QQPoint {
  theoreticalZ: number;
  expectedValue: number;
  observedValue: number;
}

export function calculateQQPlot(values: number[], maxPoints: number = 200): QQPoint[] {
  const n = values.length;
  if (n < 3) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
  const sd = Math.sqrt(variance);

  const allPoints: QQPoint[] = sorted.map((obs, idx) => {
    const p = (idx + 1 - 0.375) / (n + 0.25); // Blom plotting position
    const z = inverseNormalCDF(p);
    return {
      theoreticalZ: Number(z.toFixed(3)),
      expectedValue: Number((mean + z * sd).toFixed(4)),
      observedValue: Number(obs.toFixed(4)),
    };
  });

  if (allPoints.length <= maxPoints) return allPoints;

  // Keep tails intact + uniform sampling in the middle
  const kept: QQPoint[] = [];
  const tail = 15;
  for (let i = 0; i < tail; i++) kept.push(allPoints[i]);
  const midBudget = maxPoints - 2 * tail;
  const midStart = tail;
  const midEnd = allPoints.length - tail;
  const step = (midEnd - midStart) / midBudget;
  for (let s = 0; s < midBudget; s++) {
    kept.push(allPoints[Math.floor(midStart + s * step)]);
  }
  for (let i = midEnd; i < allPoints.length; i++) kept.push(allPoints[i]);
  return kept;
}

// --- 2. Multi-Column Batch Triage (CMM / All-Features Screening) ---

export interface ColumnTriageItem {
  column: string;
  count: number;
  usl: number;
  lsl: number;
  cpk: number | null;
  ppk: number | null;
  nonNormalPpk: number | null;
  effectivePpk: number | null;
  oosCount: number;
  oosPercent: number;
  ppmObserved: number;
  isNormal: boolean | null;
  normalityPValue: number | null;
  anomalyCount: number;
  criticalCount: number;
  mrOutOfControlCount: number;
  recommendedMethod: 'Normal' | 'Icke-normal (Percentil)';
  status: 'critical' | 'warning' | 'healthy';
  urgencyScore: number;
}

export function runBatchTriage(
  rows: ProductionRow[],
  columns: string[],
  specsByColumn: Record<string, SpecLimits>
): ColumnTriageItem[] {
  const items: ColumnTriageItem[] = columns.map((col) => {
    const vals = extractMetricValues(rows, col);
    const spec = specsByColumn[col] || {
      ...suggestSpecLimits(vals),
      uslLabel: 'USL',
      lslLabel: 'LSL',
    };
    const stats = calculateStats(vals, spec.usl, spec.lsl, spec.target);
    const { anomalies } = detectAnomalies(rows, col, spec.usl, spec.lsl, stats);
    const nonNormal = calculateNonNormalCapability(vals, spec.usl, spec.lsl);
    const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
    const useNonNormal = stats.isNormal === false && nonNormal.ppk !== null;
    const effectivePpk = useNonNormal ? nonNormal.ppk : stats.ppk;

    const isCritical =
      stats.oosCount > 0 ||
      criticalCount > 0 ||
      (effectivePpk !== null && effectivePpk < 1.0);
    const isWarning =
      !isCritical &&
      ((effectivePpk !== null && effectivePpk < 1.33) ||
        (stats.cpk !== null && stats.cpk < 1.33) ||
        anomalies.length > 0 ||
        stats.isNormal === false);

    const status: 'critical' | 'warning' | 'healthy' = isCritical
      ? 'critical'
      : isWarning
      ? 'warning'
      : 'healthy';

    // Higher urgency score = surfaces first in triage table
    let urgencyScore = 0;
    if (status === 'critical') urgencyScore += 1000;
    else if (status === 'warning') urgencyScore += 500;
    urgencyScore += stats.oosCount * 40 + criticalCount * 15 + anomalies.length * 2;
    if (effectivePpk !== null) {
      urgencyScore += Math.max(0, (2.0 - effectivePpk) * 100);
    }

    return {
      column: col,
      count: stats.count,
      usl: spec.usl,
      lsl: spec.lsl,
      cpk: stats.cpk,
      ppk: stats.ppk,
      nonNormalPpk: nonNormal.ppk,
      effectivePpk,
      oosCount: stats.oosCount,
      oosPercent: stats.oosPercent,
      ppmObserved: stats.ppmObserved,
      isNormal: stats.isNormal,
      normalityPValue: stats.normalityPValue,
      anomalyCount: anomalies.length,
      criticalCount,
      mrOutOfControlCount: stats.mrOutOfControlCount,
      recommendedMethod: useNonNormal ? 'Icke-normal (Percentil)' : 'Normal',
      status,
      urgencyScore,
    };
  });

  return items.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

// --- 3. Automatic Cross-Column Correlation & Regression Scanner ---

export interface CorrelationScatterPoint {
  rowIndex: number;
  label: string;
  x: number;
  y: number;
  fitted: number;
}

export interface CorrelationFinding {
  predictor: string;
  target: string;
  n: number;
  r: number;
  rSquared: number;
  slope: number;
  intercept: number;
  pValue: number;
  isSignificant: boolean;
  strength: 'Stark' | 'Måttlig' | 'Svag' | 'Försumbar';
  direction: 'Positiv' | 'Negativ' | 'Ingen';
  scatter: CorrelationScatterPoint[];
  linePoints: Array<{ x: number; fitted: number }>;
}

export function scanCorrelations(
  rows: ProductionRow[],
  targetColumn: string,
  allColumns: string[]
): CorrelationFinding[] {
  const findings: CorrelationFinding[] = [];

  for (const col of allColumns) {
    if (col === targetColumn) continue;

    const pairs: Array<{ rowIndex: number; label: string; x: number; y: number }> = [];
    for (const row of rows) {
      const x = row.values[col];
      const y = row.values[targetColumn];
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
        pairs.push({ rowIndex: row.rowIndex, label: row.label, x, y });
      }
    }

    const n = pairs.length;
    if (n < 4) continue;

    const meanX = pairs.reduce((s, p) => s + p.x, 0) / n;
    const meanY = pairs.reduce((s, p) => s + p.y, 0) / n;

    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const p of pairs) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }

    if (sxx <= 1e-15 || syy <= 1e-15) continue;

    const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
    const rSquared = r * r;
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    const denom = Math.max(1e-15, 1 - rSquared);
    const tStat = Math.abs(r) * Math.sqrt((n - 2) / denom);
    const pValue = rSquared >= 1 - 1e-12 ? 0 : studentTTwoTailedP(tStat, n - 2);
    const absR = Math.abs(r);

    const strength: CorrelationFinding['strength'] =
      absR >= 0.7 ? 'Stark' : absR >= 0.4 ? 'Måttlig' : absR >= 0.2 ? 'Svag' : 'Försumbar';
    const direction: CorrelationFinding['direction'] =
      absR < 0.05 ? 'Ingen' : r > 0 ? 'Positiv' : 'Negativ';

    // Cap scatter points for fast SVG rendering
    const step = pairs.length > 250 ? Math.ceil(pairs.length / 250) : 1;
    const scatter: CorrelationScatterPoint[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i].x < minX) minX = pairs[i].x;
      if (pairs[i].x > maxX) maxX = pairs[i].x;
      if (i % step === 0) {
        scatter.push({
          rowIndex: pairs[i].rowIndex,
          label: pairs[i].label,
          x: Number(pairs[i].x.toFixed(4)),
          y: Number(pairs[i].y.toFixed(4)),
          fitted: Number((intercept + slope * pairs[i].x).toFixed(4)),
        });
      }
    }

    findings.push({
      predictor: col,
      target: targetColumn,
      n,
      r,
      rSquared,
      slope,
      intercept,
      pValue,
      isSignificant: pValue < 0.05,
      strength,
      direction,
      scatter,
      linePoints: [
        { x: Number(minX.toFixed(4)), fitted: Number((intercept + slope * minX).toFixed(4)) },
        { x: Number(maxX.toFixed(4)), fitted: Number((intercept + slope * maxX).toFixed(4)) },
      ],
    });
  }

  return findings.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// --- 4. Before / After Phase Split & Welch 2-Sample t-Test + F-Test ---

export interface BeforeAfterResult {
  splitRow: number;
  before: StatsResult;
  after: StatsResult;
  meanDiff: number;
  meanDiffPercent: number | null;
  tStat: number | null;
  welchDf: number | null;
  tPValue: number | null;
  meanChangedSignificantly: boolean;
  fStat: number | null;
  fPValue: number | null;
  spreadChangedSignificantly: boolean;
  verdict: string;
}

export function analyzeBeforeAfter(
  rows: ProductionRow[],
  metric: string,
  splitRow: number,
  usl: number,
  lsl: number,
  target?: number
): BeforeAfterResult | null {
  const beforeVals = extractMetricValues(
    rows.filter((r) => r.rowIndex < splitRow),
    metric
  );
  const afterVals = extractMetricValues(
    rows.filter((r) => r.rowIndex >= splitRow),
    metric
  );

  if (beforeVals.length < 3 || afterVals.length < 3) {
    return null;
  }

  const before = calculateStats(beforeVals, usl, lsl, target);
  const after = calculateStats(afterVals, usl, lsl, target);
  const meanDiff = after.mean - before.mean;
  const meanDiffPercent =
    Math.abs(before.mean) > 1e-12 ? (meanDiff / Math.abs(before.mean)) * 100 : null;

  const v1 = before.stdDev * before.stdDev;
  const v2 = after.stdDev * after.stdDev;
  const n1 = before.count;
  const n2 = after.count;

  let tStat: number | null = null;
  let welchDf: number | null = null;
  let tPValue: number | null = null;

  const se2 = v1 / n1 + v2 / n2;
  if (se2 > 1e-15) {
    tStat = meanDiff / Math.sqrt(se2);
    const num = se2 * se2;
    const den =
      Math.pow(v1 / n1, 2) / Math.max(1, n1 - 1) +
      Math.pow(v2 / n2, 2) / Math.max(1, n2 - 1);
    welchDf = den > 1e-15 ? num / den : n1 + n2 - 2;
    tPValue = studentTTwoTailedP(tStat, welchDf);
  }

  let fStat: number | null = null;
  let fPValue: number | null = null;
  if (v1 > 1e-15 && v2 > 1e-15) {
    // Two-tailed F-test using larger variance in numerator
    if (v1 >= v2) {
      fStat = v1 / v2;
      fPValue = Math.min(1, 2 * fDistUpperTailP(fStat, n1 - 1, n2 - 1));
    } else {
      fStat = v2 / v1;
      fPValue = Math.min(1, 2 * fDistUpperTailP(fStat, n2 - 1, n1 - 1));
    }
  }

  const meanChangedSignificantly = tPValue !== null && tPValue < 0.05;
  const spreadChangedSignificantly = fPValue !== null && fPValue < 0.05;

  const meanPart = meanChangedSignificantly
    ? `Medelvärdet ändrades signifikant med ${meanDiff >= 0 ? '+' : ''}${meanDiff.toFixed(4)} (p = ${tPValue!.toFixed(4)}).`
    : `Ingen statistiskt signifikant förändring i medelvärde (${meanDiff >= 0 ? '+' : ''}${meanDiff.toFixed(4)}, p = ${tPValue !== null ? tPValue.toFixed(4) : '–'}).`;

  const spreadPart = spreadChangedSignificantly
    ? ` Spridningen (σ) ${after.stdDev < before.stdDev ? 'minskade' : 'ökade'} signifikant från ${before.stdDev.toFixed(4)} till ${after.stdDev.toFixed(4)} (p = ${fPValue!.toFixed(4)}).`
    : ` Spridningen förändrades inte signifikant (σ: ${before.stdDev.toFixed(4)} → ${after.stdDev.toFixed(4)}).`;

  return {
    splitRow,
    before,
    after,
    meanDiff,
    meanDiffPercent,
    tStat,
    welchDf,
    tPValue,
    meanChangedSignificantly,
    fStat,
    fPValue,
    spreadChangedSignificantly,
    verdict: meanPart + spreadPart,
  };
}

// --- 5. Categorical Group Comparison (One-Way ANOVA + Group Summaries) ---

export interface GroupSummary {
  group: string;
  count: number;
  mean: number;
  median: number;
  min: number;
  q1: number;
  q3: number;
  max: number;
  stdDev: number;
  cpk: number | null;
  oosCount: number;
}

export interface GroupAnovaResult {
  categoryColumn: string;
  groups: GroupSummary[];
  fStat: number | null;
  dfBetween: number;
  dfWithin: number;
  pValue: number | null;
  etaSquared: number | null;
  isSignificant: boolean;
  verdict: string;
}

export function analyzeGroups(
  rows: ProductionRow[],
  metric: string,
  categoryColumn: string,
  usl: number,
  lsl: number
): GroupAnovaResult | null {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const val = row.values[metric];
    const cat = row.categories?.[categoryColumn];
    if (typeof val === 'number' && Number.isFinite(val) && cat && cat.trim()) {
      const key = cat.trim();
      const arr = buckets.get(key) || [];
      arr.push(val);
      buckets.set(key, arr);
    }
  }

  const validEntries = Array.from(buckets.entries()).filter(([, vals]) => vals.length >= 2);
  if (validEntries.length < 2) return null;

  const groups: GroupSummary[] = validEntries
    .map(([group, vals]) => {
      const s = calculateStats(vals, usl, lsl);
      return {
        group,
        count: s.count,
        mean: s.mean,
        median: s.median,
        min: s.min,
        q1: s.q1,
        q3: s.q3,
        max: s.max,
        stdDev: s.stdDev,
        cpk: s.cpk,
        oosCount: s.oosCount,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group, 'sv'));

  // One-Way ANOVA
  const allVals = validEntries.flatMap(([, vals]) => vals);
  const grandN = allVals.length;
  const k = groups.length;
  const grandMean = allVals.reduce((a, b) => a + b, 0) / grandN;

  let ssBetween = 0;
  let ssWithin = 0;
  for (const [, vals] of validEntries) {
    const gMean = vals.reduce((a, b) => a + b, 0) / vals.length;
    ssBetween += vals.length * Math.pow(gMean - grandMean, 2);
    for (const v of vals) {
      ssWithin += Math.pow(v - gMean, 2);
    }
  }

  const dfBetween = k - 1;
  const dfWithin = grandN - k;
  const ssTotal = ssBetween + ssWithin;
  const etaSquared = ssTotal > 1e-15 ? ssBetween / ssTotal : 0;

  let fStat: number | null = null;
  let pValue: number | null = null;
  if (dfBetween > 0 && dfWithin > 0 && ssWithin > 1e-15) {
    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;
    fStat = msBetween / msWithin;
    pValue = fDistUpperTailP(fStat, dfBetween, dfWithin);
  }

  const isSignificant = pValue !== null && pValue < 0.05;
  const sortedByMean = [...groups].sort((a, b) => b.mean - a.mean);
  const highest = sortedByMean[0];
  const lowest = sortedByMean[sortedByMean.length - 1];
  const diff = highest.mean - lowest.mean;

  const verdict = isSignificant
    ? `Signifikant skillnad mellan ${categoryColumn}-grupper (ANOVA p = ${pValue!.toFixed(4)}, η² = ${(etaSquared * 100).toFixed(1)} %). "${highest.group}" ligger i snitt +${diff.toFixed(4)} över "${lowest.group}".`
    : `Ingen statistiskt signifikant skillnad mellan ${categoryColumn}-grupper (ANOVA p = ${pValue !== null ? pValue.toFixed(4) : '–'}).`;

  return {
    categoryColumn,
    groups,
    fStat,
    dfBetween,
    dfWithin,
    pValue,
    etaSquared,
    isSignificant,
    verdict,
  };
}
