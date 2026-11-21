export interface ProductionRow {
  rowIndex: number;
  timestamp: string;
  label: string;
  values: Record<string, number>;
  categories?: Record<string, string>;
}

export interface ExcludedPoint {
  rowIndex: number;
  reason: string;
  excludedAt: string;
}

export interface SpecLimits {
  usl: number;
  lsl: number;
  target: number;
  uslLabel: string;
  lslLabel: string;
}

export interface StatsResult {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  stdDev: number;
  stdDevWithin: number;
  mrBar: number;
  uclMr: number;
  mrOutOfControlCount: number;
  cp: number | null;
  cpk: number | null;
  pp: number | null;
  ppk: number | null;
  usl: number;
  lsl: number;
  target: number;
  ucl: number;
  lcl: number;
  zone2Upper: number;
  zone2Lower: number;
  zone1Upper: number;
  zone1Lower: number;
  skewness: number | null;
  kurtosis: number | null;
  normalityTestName: string;
  normalityStatistic: number | null;
  normalityPValue: number | null;
  isNormal: boolean | null;
  oosCount: number;
  oosPercent: number;
  ppmObserved: number;
  ppmExpected: number | null;
  warnings: string[];
}

export type AnomalyType =
  | 'out-of-spec'
  | 'out-of-control'
  | 'mr-out-of-control'
  | 'shift-in-mean'
  | 'trend'
  | 'oscillation'
  | 'high-variance'
  | 'low-variance';

export interface Anomaly {
  id: string;
  rowIndex: number;
  timestamp: string;
  label: string;
  value: number;
  metric: string;
  ruleCode: string;
  type: AnomalyType;
  severity: 'critical' | 'warning';
  explanation: string;
}

export interface ChartPoint {
  rowIndex: number;
  timestamp: string;
  label: string;
  value: number;
  mr: number | null;
  mrOutOfControl: boolean;
  movingAverage: number | null;
  anomalies: Anomaly[];
  isOos: boolean;
  hasAnomaly: boolean;
  primaryBadge: string | null;
}

export interface HistogramBin {
  binLabel: string;
  start: number;
  end: number;
  midpoint: number;
  count: number;
  normalExpected: number;
  outOfSpec: boolean;
}

export interface RollingCapabilityPoint {
  rowIndex: number;
  timestamp: string;
  label: string;
  cp: number | null;
  cpk: number | null;
}

export interface ProcessDiagnosis {
  level: 'healthy' | 'warning' | 'critical';
  headline: string;
  summary: string;
  findings: string[];
}

const D2_N2 = 1.128;
const D4_N2 = 3.267;

export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
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

/**
 * D'Agostino-Pearson K² omnibus normality test (skewness + kurtosis).
 * Matches scipy.stats.normaltest. Requires n >= 8 and non-zero variance.
 */
export function dagostinoPearsonTest(values: number[]): {
  k2: number | null;
  pValue: number | null;
  isNormal: boolean | null;
} {
  const n = values.length;
  if (n < 8) {
    return { k2: null, pValue: null, isNormal: null };
  }

  const mean = values.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;

  if (m2 <= 1e-15) {
    return { k2: null, pValue: null, isNormal: null };
  }

  // 1. Skewness Z1 (D'Agostino 1970)
  const g1 = m3 / Math.pow(m2, 1.5);
  const y = g1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 =
    (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) /
    ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const w2 = -1 + Math.sqrt(Math.max(1, 2 * (beta2 - 1)));
  const delta = 1 / Math.sqrt(Math.max(1e-12, 0.5 * Math.log(w2)));
  const alpha = Math.sqrt(2 / Math.max(1e-12, w2 - 1));
  const yOverAlpha = y / alpha;
  const z1 = delta * Math.log(yOverAlpha + Math.sqrt(yOverAlpha * yOverAlpha + 1));

  // 2. Kurtosis Z2 (Anscombe & Glynn 1983)
  const b2 = m4 / (m2 * m2);
  const e = (3 * (n - 1)) / (n + 1);
  const varB2 =
    (24 * n * (n - 2) * (n - 3)) /
    (Math.pow(n + 1, 2) * (n + 3) * (n + 5));
  const x = (b2 - e) / Math.sqrt(Math.max(1e-15, varB2));
  const sqrtBeta1 =
    ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) *
    Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const a =
    6 +
    (8 / sqrtBeta1) *
      (2 / sqrtBeta1 + Math.sqrt(1 + 4 / (sqrtBeta1 * sqrtBeta1)));

  const term1 = 1 - 2 / (9 * a);
  const denom = 1 + x * Math.sqrt(2 / Math.max(1e-12, a - 4));
  const ratio = (1 - 2 / a) / denom;
  const term2 = Math.cbrt(ratio);
  const z2 = (term1 - term2) / Math.sqrt(2 / (9 * a));

  if (!Number.isFinite(z1) || !Number.isFinite(z2)) {
    return { k2: null, pValue: null, isNormal: null };
  }

  const k2 = z1 * z1 + z2 * z2;
  // Exact survival function for chi-square with df = 2: exp(-k2 / 2)
  const pValue = Math.exp(-k2 / 2);

  return {
    k2,
    pValue,
    isNormal: pValue >= 0.05,
  };
}

export function extractMetricValues(rows: ProductionRow[], metric: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const val = rows[i].values[metric];
    if (typeof val === 'number' && Number.isFinite(val)) {
      out.push(val);
    }
  }
  return out;
}

export function calculateStats(
  values: number[],
  usl: number,
  lsl: number,
  target?: number
): StatsResult {
  const n = values.length;
  const resolvedTarget = target !== undefined && Number.isFinite(target) ? target : (usl + lsl) / 2;
  const warnings: string[] = [];

  if (usl <= lsl) {
    warnings.push('Övre toleransgräns (USL) måste vara större än nedre toleransgräns (LSL).');
  }

  if (n === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      stdDev: 0,
      stdDevWithin: 0,
      mrBar: 0,
      uclMr: 0,
      mrOutOfControlCount: 0,
      cp: null,
      cpk: null,
      pp: null,
      ppk: null,
      usl,
      lsl,
      target: resolvedTarget,
      ucl: 0,
      lcl: 0,
      zone2Upper: 0,
      zone2Lower: 0,
      zone1Upper: 0,
      zone1Lower: 0,
      skewness: null,
      kurtosis: null,
      normalityTestName: "D'Agostino-Pearson K²",
      normalityStatistic: null,
      normalityPValue: null,
      isNormal: null,
      oosCount: 0,
      oosPercent: 0,
      ppmObserved: 0,
      ppmExpected: null,
      warnings: [...warnings, 'Inga numeriska mätvärden tillgängliga för vald kolumn.'],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);

  const variance =
    n > 1
      ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  // Moving range (I-MR)
  let sumMR = 0;
  const mrs: number[] = [];
  for (let i = 1; i < n; i++) {
    const mr = Math.abs(values[i] - values[i - 1]);
    mrs.push(mr);
    sumMR += mr;
  }
  const mrBar = mrs.length > 0 ? sumMR / mrs.length : 0;
  const stdDevWithin = mrBar / D2_N2;
  const uclMr = D4_N2 * mrBar;
  const mrOutOfControlCount =
    mrBar > 0 ? mrs.filter((mr) => mr > uclMr).length : 0;

  // Sample skewness & excess kurtosis
  let skewness: number | null = null;
  let kurtosis: number | null = null;
  if (stdDev > 1e-12) {
    if (n >= 3) {
      const m3 = values.reduce((acc, v) => acc + Math.pow(v - mean, 3), 0);
      skewness = (n * m3) / ((n - 1) * (n - 2) * Math.pow(stdDev, 3));
    }
    if (n >= 4) {
      const m4 = values.reduce((acc, v) => acc + Math.pow(v - mean, 4), 0);
      kurtosis =
        (n * (n + 1) * m4) /
          ((n - 1) * (n - 2) * (n - 3) * Math.pow(stdDev, 4)) -
        (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    }
  }

  const validSpec = usl > lsl;
  let cp: number | null = null;
  let cpk: number | null = null;
  let pp: number | null = null;
  let ppk: number | null = null;

  if (validSpec && stdDevWithin > 1e-12) {
    cp = (usl - lsl) / (6 * stdDevWithin);
    const cpu = (usl - mean) / (3 * stdDevWithin);
    const cpl = (mean - lsl) / (3 * stdDevWithin);
    cpk = Math.min(cpu, cpl);
  } else if (n >= 2 && stdDevWithin <= 1e-12) {
    warnings.push('Kortsiktig spridning (σ Within) är 0 — Cp/Cpk kan inte beräknas.');
  }

  if (validSpec && stdDev > 1e-12) {
    pp = (usl - lsl) / (6 * stdDev);
    const ppu = (usl - mean) / (3 * stdDev);
    const ppl = (mean - lsl) / (3 * stdDev);
    ppk = Math.min(ppu, ppl);
  } else if (n >= 2 && stdDev <= 1e-12) {
    warnings.push('Konstanta mätvärden (σ Overall = 0) — Pp/Ppk kan inte beräknas.');
  }

  const ucl = mean + 3 * stdDevWithin;
  const lcl = mean - 3 * stdDevWithin;
  const zone2Upper = mean + 2 * stdDevWithin;
  const zone2Lower = mean - 2 * stdDevWithin;
  const zone1Upper = mean + 1 * stdDevWithin;
  const zone1Lower = mean - 1 * stdDevWithin;

  const oosCount = validSpec
    ? values.filter((v) => v > usl || v < lsl).length
    : 0;
  const oosPercent = (oosCount / n) * 100;
  const ppmObserved = (oosCount / n) * 1_000_000;

  let ppmExpected: number | null = null;
  if (validSpec && stdDev > 1e-12) {
    const pAbove = 1 - normalCDF((usl - mean) / stdDev);
    const pBelow = normalCDF((lsl - mean) / stdDev);
    ppmExpected = Math.max(0, (pAbove + pBelow) * 1_000_000);
  }

  const normality = dagostinoPearsonTest(values);
  if (n < 8) {
    warnings.push('Färre än 8 mätpunkter — normalitetstest (D\'Agostino-Pearson K²) kräver minst 8 punkter.');
  }

  return {
    count: n,
    mean,
    median,
    min,
    max,
    q1,
    q3,
    stdDev,
    stdDevWithin,
    mrBar,
    uclMr,
    mrOutOfControlCount,
    cp,
    cpk,
    pp,
    ppk,
    usl,
    lsl,
    target: resolvedTarget,
    ucl,
    lcl,
    zone2Upper,
    zone2Lower,
    zone1Upper,
    zone1Lower,
    skewness,
    kurtosis,
    normalityTestName: "D'Agostino-Pearson K²",
    normalityStatistic: normality.k2,
    normalityPValue: normality.pValue,
    isNormal: normality.isNormal,
    oosCount,
    oosPercent,
    ppmObserved,
    ppmExpected,
    warnings,
  };
}

export function detectAnomalies(
  rows: ProductionRow[],
  metric: string,
  usl: number,
  lsl: number,
  precomputedStats?: StatsResult
): { anomalies: Anomaly[]; anomaliesByRow: Record<number, Anomaly[]> } {
  const validRows = rows.filter(
    (r) => typeof r.values[metric] === 'number' && Number.isFinite(r.values[metric])
  );
  if (validRows.length < 2) {
    return { anomalies: [], anomaliesByRow: {} };
  }

  const values = validRows.map((r) => r.values[metric]);
  const stats = precomputedStats || calculateStats(values, usl, lsl);
  const { mean, stdDevWithin, ucl, lcl, uclMr, mrBar } = stats;
  const anomalies: Anomaly[] = [];

  const pushAnomaly = (a: Anomaly) => {
    anomalies.push(a);
  };

  // 0. Out of Specification (OOS)
  if (usl > lsl) {
    validRows.forEach((row, idx) => {
      const val = values[idx];
      if (val > usl || val < lsl) {
        pushAnomaly({
          id: `oos-${row.rowIndex}`,
          rowIndex: row.rowIndex,
          timestamp: row.timestamp,
          label: row.label,
          value: val,
          metric,
          ruleCode: 'OOS',
          type: 'out-of-spec',
          severity: 'critical',
          explanation:
            val > usl
              ? `Värdet (${val.toFixed(3)}) överskrider USL (${usl.toFixed(3)}).`
              : `Värdet (${val.toFixed(3)}) underskrider LSL (${lsl.toFixed(3)}).`,
        });
      }
    });
  }

  // Moving Range Out of Control
  if (mrBar > 1e-12) {
    for (let i = 1; i < validRows.length; i++) {
      const mr = Math.abs(values[i] - values[i - 1]);
      if (mr > uclMr) {
        const row = validRows[i];
        pushAnomaly({
          id: `mr-${row.rowIndex}`,
          rowIndex: row.rowIndex,
          timestamp: row.timestamp,
          label: row.label,
          value: values[i],
          metric,
          ruleCode: 'MR',
          type: 'mr-out-of-control',
          severity: 'critical',
          explanation: `Moving Range (${mr.toFixed(3)}) överskrider UCL_MR (${uclMr.toFixed(3)}) — instabil punkt-till-punkt-variation.`,
        });
      }
    }
  }

  if (stdDevWithin > 1e-12) {
    // Nelson Rule 1: Point outside 3σ control limits
    validRows.forEach((row, idx) => {
      const val = values[idx];
      if (val > ucl || val < lcl) {
        pushAnomaly({
          id: `we1-${row.rowIndex}`,
          rowIndex: row.rowIndex,
          timestamp: row.timestamp,
          label: row.label,
          value: val,
          metric,
          ruleCode: 'T1',
          type: 'out-of-control',
          severity: 'critical',
          explanation: `Test 1 (3σ): Punkt (${val.toFixed(3)}) utanför kontrollgränserna [${lcl.toFixed(3)}, ${ucl.toFixed(3)}].`,
        });
      }
    });

    // Nelson Rule 2: 9 points in a row on same side of center line
    if (values.length >= 9) {
      for (let i = 8; i < values.length; i++) {
        const slice = values.slice(i - 8, i + 1);
        if (slice.every((v) => v > mean) || slice.every((v) => v < mean)) {
          const row = validRows[i];
          pushAnomaly({
            id: `we2-${row.rowIndex}`,
            rowIndex: row.rowIndex,
            timestamp: row.timestamp,
            label: row.label,
            value: values[i],
            metric,
            ruleCode: 'T2',
            type: 'shift-in-mean',
            severity: 'warning',
            explanation: `Test 2: 9 punkter i rad på samma sida om medelvärdet (${mean.toFixed(3)}) — medelvärdesskift.`,
          });
        }
      }
    }

    // Nelson Rule 3: 6 points steadily increasing or decreasing
    if (values.length >= 6) {
      for (let i = 5; i < values.length; i++) {
        const slice = values.slice(i - 5, i + 1);
        const inc = slice.every((v, idx) => idx === 0 || v > slice[idx - 1]);
        const dec = slice.every((v, idx) => idx === 0 || v < slice[idx - 1]);
        if (inc || dec) {
          const row = validRows[i];
          pushAnomaly({
            id: `we3-${row.rowIndex}`,
            rowIndex: row.rowIndex,
            timestamp: row.timestamp,
            label: row.label,
            value: values[i],
            metric,
            ruleCode: 'T3',
            type: 'trend',
            severity: 'warning',
            explanation: `Test 3: 6 punkter i rad som stadigt ${inc ? 'ökar' : 'minskar'} — indikerar drift eller verktygsslitage.`,
          });
        }
      }
    }

    // Nelson Rule 4: 14 points alternating up and down
    if (values.length >= 14) {
      for (let i = 13; i < values.length; i++) {
        const slice = values.slice(i - 13, i + 1);
        let alternating = true;
        for (let j = 1; j < slice.length - 1; j++) {
          const d1 = slice[j] - slice[j - 1];
          const d2 = slice[j + 1] - slice[j];
          if ((d1 >= 0 && d2 >= 0) || (d1 <= 0 && d2 <= 0)) {
            alternating = false;
            break;
          }
        }
        if (alternating) {
          const row = validRows[i];
          pushAnomaly({
            id: `we4-${row.rowIndex}`,
            rowIndex: row.rowIndex,
            timestamp: row.timestamp,
            label: row.label,
            value: values[i],
            metric,
            ruleCode: 'T4',
            type: 'oscillation',
            severity: 'warning',
            explanation: `Test 4: 14 punkter i rad alternerar upp och ner — indikerar överjustering eller två växlande källor.`,
          });
        }
      }
    }

    // Nelson Rule 5: 2 of 3 points > 2σ on same side
    if (values.length >= 3) {
      const s2 = 2 * stdDevWithin;
      for (let i = 2; i < values.length; i++) {
        const win = values.slice(i - 2, i + 1);
        const above = win.filter((v) => v > mean + s2).length >= 2 && values[i] > mean + s2;
        const below = win.filter((v) => v < mean - s2).length >= 2 && values[i] < mean - s2;
        if (above || below) {
          const row = validRows[i];
          pushAnomaly({
            id: `we5-${row.rowIndex}`,
            rowIndex: row.rowIndex,
            timestamp: row.timestamp,
            label: row.label,
            value: values[i],
            metric,
            ruleCode: 'T5',
            type: 'high-variance',
            severity: 'warning',
            explanation: `Test 5: 2 av 3 punkter utanför 2σ på samma sida om medelvärdet.`,
          });
        }
      }
    }

    // Nelson Rule 6: 4 of 5 points > 1σ on same side
    if (values.length >= 5) {
      const s1 = stdDevWithin;
      for (let i = 4; i < values.length; i++) {
        const win = values.slice(i - 4, i + 1);
        const above = win.filter((v) => v > mean + s1).length >= 4 && values[i] > mean + s1;
        const below = win.filter((v) => v < mean - s1).length >= 4 && values[i] < mean - s1;
        if (above || below) {
          const row = validRows[i];
          pushAnomaly({
            id: `we6-${row.rowIndex}`,
            rowIndex: row.rowIndex,
            timestamp: row.timestamp,
            label: row.label,
            value: values[i],
            metric,
            ruleCode: 'T6',
            type: 'high-variance',
            severity: 'warning',
            explanation: `Test 6: 4 av 5 punkter utanför 1σ på samma sida om medelvärdet.`,
          });
        }
      }
    }

    // Nelson Rule 7: 15 points in a row within 1σ (stratification / hugging)
    if (values.length >= 15) {
      const s1 = stdDevWithin;
      for (let i = 14; i < values.length; i++) {
        const slice = values.slice(i - 14, i + 1);
        if (slice.every((v) => Math.abs(v - mean) <= s1)) {
          const row = validRows[i];
          pushAnomaly({
            id: `we7-${row.rowIndex}`,
            rowIndex: row.rowIndex,
            timestamp: row.timestamp,
            label: row.label,
            value: values[i],
            metric,
            ruleCode: 'T7',
            type: 'low-variance',
            severity: 'warning',
            explanation: `Test 7: 15 punkter i rad inom ±1σ (stratifiering / låg upplösning eller förbättrad spridning).`,
          });
        }
      }
    }

    // Nelson Rule 8: 8 points in a row > 1σ on either side (mixture)
    if (values.length >= 8) {
      const s1 = stdDevWithin;
      for (let i = 7; i < values.length; i++) {
        const slice = values.slice(i - 7, i + 1);
        if (slice.every((v) => Math.abs(v - mean) > s1)) {
          const row = validRows[i];
          pushAnomaly({
            id: `we8-${row.rowIndex}`,
            rowIndex: row.rowIndex,
            timestamp: row.timestamp,
            label: row.label,
            value: values[i],
            metric,
            ruleCode: 'T8',
            type: 'high-variance',
            severity: 'warning',
            explanation: `Test 8: 8 punkter i rad utanför ±1σ (mixture-mönster / två skilda processnivåer).`,
          });
        }
      }
    }
  }

  const anomaliesByRow: Record<number, Anomaly[]> = {};
  for (const a of anomalies) {
    if (!anomaliesByRow[a.rowIndex]) {
      anomaliesByRow[a.rowIndex] = [];
    }
    anomaliesByRow[a.rowIndex].push(a);
  }

  return { anomalies, anomaliesByRow };
}

export function buildChartSeries(
  rows: ProductionRow[],
  metric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  showMovingAverage: boolean,
  movingAvgWindow: number = 5
): ChartPoint[] {
  const validRows = rows.filter(
    (r) => typeof r.values[metric] === 'number' && Number.isFinite(r.values[metric])
  );

  const points: ChartPoint[] = [];
  let runningSum = 0;

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const value = row.values[metric];
    runningSum += value;
    if (i >= movingAvgWindow) {
      runningSum -= validRows[i - movingAvgWindow].values[metric];
    }
    const maLen = Math.min(i + 1, movingAvgWindow);
    const mr = i > 0 ? Math.abs(value - validRows[i - 1].values[metric]) : null;
    const mrOutOfControl = mr !== null && stats.mrBar > 1e-12 && mr > stats.uclMr;
    const rowAnomalies = anomaliesByRow[row.rowIndex] || [];
    const isOos = stats.usl > stats.lsl && (value > stats.usl || value < stats.lsl);

    let primaryBadge: string | null = null;
    if (isOos) {
      primaryBadge = 'OOS';
    } else if (rowAnomalies.length > 0) {
      primaryBadge = rowAnomalies[0].ruleCode;
    }

    points.push({
      rowIndex: row.rowIndex,
      timestamp: row.timestamp,
      label: row.label,
      value,
      mr,
      mrOutOfControl,
      movingAverage: showMovingAverage ? runningSum / maLen : null,
      anomalies: rowAnomalies,
      isOos,
      hasAnomaly: rowAnomalies.length > 0,
      primaryBadge,
    });
  }

  return points;
}

/**
 * Downsamples large series for SVG rendering while preserving 100% of anomaly/OOS points,
 * first/last points, and local extrema. All SPC calculations always use 100% of rows.
 */
export function downsampleChartSeries(
  points: ChartPoint[],
  maxPoints: number = 400
): { displayPoints: ChartPoint[]; isDownsampled: boolean } {
  if (points.length <= maxPoints) {
    return { displayPoints: points, isDownsampled: false };
  }

  const keptIndices = new Set<number>();
  keptIndices.add(0);
  keptIndices.add(points.length - 1);

  for (let i = 0; i < points.length; i++) {
    if (points[i].isOos || points[i].hasAnomaly || points[i].mrOutOfControl) {
      keptIndices.add(i);
    }
  }

  const remainingBudget = Math.max(50, maxPoints - keptIndices.size);
  const step = points.length / remainingBudget;
  for (let s = 0; s < remainingBudget; s++) {
    const idx = Math.min(points.length - 1, Math.floor(s * step));
    keptIndices.add(idx);
  }

  const sortedIndices = Array.from(keptIndices).sort((a, b) => a - b);
  return {
    displayPoints: sortedIndices.map((idx) => points[idx]),
    isDownsampled: true,
  };
}

export function calculateHistogram(
  values: number[],
  stats: StatsResult,
  binCount: number = 12
): HistogramBin[] {
  if (values.length === 0) return [];
  const safeBins = Math.max(3, Math.min(30, binCount));
  const minVal = Math.min(stats.min, stats.usl > stats.lsl ? stats.lsl : stats.min);
  const maxVal = Math.max(stats.max, stats.usl > stats.lsl ? stats.usl : stats.max);
  const span = maxVal - minVal;

  if (span <= 1e-12) {
    return [
      {
        binLabel: stats.mean.toFixed(2),
        start: stats.mean,
        end: stats.mean,
        midpoint: stats.mean,
        count: values.length,
        normalExpected: values.length,
        outOfSpec: stats.usl > stats.lsl && (stats.mean > stats.usl || stats.mean < stats.lsl),
      },
    ];
  }

  const pad = span * 0.04;
  const domainMin = minVal - pad;
  const domainMax = maxVal + pad;
  const binWidth = (domainMax - domainMin) / safeBins;

  const bins: HistogramBin[] = Array.from({ length: safeBins }, (_, i) => {
    const start = domainMin + i * binWidth;
    const end = start + binWidth;
    const midpoint = (start + end) / 2;
    let normalExpected = 0;
    if (stats.stdDev > 1e-12) {
      const z = (midpoint - stats.mean) / stats.stdDev;
      const pdf = Math.exp(-0.5 * z * z) / (stats.stdDev * Math.sqrt(2 * Math.PI));
      normalExpected = Number((pdf * values.length * binWidth).toFixed(2));
    }

    return {
      binLabel: midpoint.toFixed(2),
      start,
      end,
      midpoint,
      count: 0,
      normalExpected,
      outOfSpec: stats.usl > stats.lsl && (midpoint > stats.usl || midpoint < stats.lsl),
    };
  });

  for (const v of values) {
    const idx = Math.min(
      safeBins - 1,
      Math.max(0, Math.floor((v - domainMin) / binWidth))
    );
    bins[idx].count += 1;
  }

  return bins;
}

export function calculateRollingCapability(
  rows: ProductionRow[],
  metric: string,
  usl: number,
  lsl: number,
  windowSize: number
): RollingCapabilityPoint[] {
  const validRows = rows.filter(
    (r) => typeof r.values[metric] === 'number' && Number.isFinite(r.values[metric])
  );
  const safeWindow = Math.max(5, windowSize);
  if (validRows.length < safeWindow || usl <= lsl) return [];

  const values = validRows.map((r) => r.values[metric]);
  const results: RollingCapabilityPoint[] = [];

  // Step automatically if dataset is very large so rolling calculation stays instantaneous
  const maxTrendPoints = 300;
  const totalWindows = validRows.length - safeWindow + 1;
  const step = totalWindows > maxTrendPoints ? Math.ceil(totalWindows / maxTrendPoints) : 1;

  for (let i = safeWindow; i <= validRows.length; i += step) {
    const start = i - safeWindow;
    let sum = 0;
    let sumMR = 0;
    for (let j = start; j < i; j++) {
      sum += values[j];
      if (j > start) {
        sumMR += Math.abs(values[j] - values[j - 1]);
      }
    }
    const mean = sum / safeWindow;
    const stdWithin = sumMR / (safeWindow - 1) / D2_N2;

    const cp = stdWithin > 1e-12 ? (usl - lsl) / (6 * stdWithin) : null;
    const cpk =
      stdWithin > 1e-12
        ? Math.min((usl - mean) / (3 * stdWithin), (mean - lsl) / (3 * stdWithin))
        : null;

    const row = validRows[i - 1];
    results.push({
      rowIndex: row.rowIndex,
      timestamp: row.timestamp,
      label: row.label,
      cp: cp !== null ? Number(cp.toFixed(3)) : null,
      cpk: cpk !== null ? Number(cpk.toFixed(3)) : null,
    });
  }

  return results;
}

export function buildProcessDiagnosis(
  stats: StatsResult,
  anomalies: Anomaly[]
): ProcessDiagnosis {
  const findings: string[] = [];

  if (stats.usl <= stats.lsl) {
    return {
      level: 'critical',
      headline: 'Ogiltiga toleransgränser',
      summary: 'Övre toleransgräns (USL) måste vara större än nedre toleransgräns (LSL) för att beräkna kapabilitet.',
      findings: ['Justera USL och LSL i verktygsraden ovan.'],
    };
  }

  const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical');
  const trendOrShift = anomalies.filter(
    (a) => a.type === 'trend' || a.type === 'shift-in-mean'
  );

  if (stats.oosCount > 0) {
    findings.push(
      `${stats.oosCount} mätpunkter (${stats.oosPercent.toFixed(1)} %, ${Math.round(stats.ppmObserved).toLocaleString('sv-SE')} PPM) ligger utanför tolerans.`
    );
  }
  if (stats.mrOutOfControlCount > 0) {
    findings.push(
      `Moving Range-grafen har ${stats.mrOutOfControlCount} överskridanden över UCL_MR — kortsiktig variation är instabil.`
    );
  }
  if (trendOrShift.length > 0) {
    findings.push(
      `${trendOrShift.length} trend- eller skiftutslag enligt Nelson-reglerna indikerar systematisk förskjutning.`
    );
  }
  if (stats.cpk !== null && stats.ppk !== null && stats.cpk - stats.ppk > 0.25) {
    findings.push(
      `Stor skillnad mellan Cpk (${stats.cpk.toFixed(2)}) och Ppk (${stats.ppk.toFixed(2)}) visar att processen har god potential men driver över tid.`
    );
  }
  if (stats.isNormal === false && stats.normalityPValue !== null) {
    findings.push(
      `Data avviker signifikant från normalfördelning (p = ${stats.normalityPValue.toFixed(4)}). Tolka Cpk/Ppk och förväntad PPM med försiktighet.`
    );
  }

  const isCritical =
    stats.oosCount > 0 ||
    (stats.ppk !== null && stats.ppk < 1.0) ||
    criticalAnomalies.length > 0;
  const isWarning =
    !isCritical &&
    ((stats.cpk !== null && stats.cpk < 1.33) ||
      (stats.ppk !== null && stats.ppk < 1.33) ||
      anomalies.length > 0 ||
      stats.isNormal === false);

  if (isCritical) {
    return {
      level: 'critical',
      headline: 'Åtgärd krävs — processen är ur kontroll eller utanför spec',
      summary:
        'Kassationsrisk eller tydliga special-cause-avvikelser detekterade. Granska markerade rader i Data & Export eller kör AI-analys för rotorsaksbedömning.',
      findings: findings.length > 0 ? findings : ['Kontrollera avvikelserna i I-MR-grafen.'],
    };
  }

  if (isWarning) {
    return {
      level: 'warning',
      headline: 'Marginal kapabilitet eller tidiga trendsignaler',
      summary:
        'Alla mätvärden ligger inom tolerans, men kapabilitetsmarginalen (mål Cpk ≥ 1.33) eller stabiliteten bör bevakas närmare.',
      findings:
        findings.length > 0
          ? findings
          : ['Processen är nära målnivån men har begränsad säkerhetsmarginal mot USL/LSL.'],
    };
  }

  return {
    level: 'healthy',
    headline: 'Processen är stabil och kapabel',
    summary:
      'Inga toleransöverskridanden eller statistiska larm i I-MR-analysen. Processen producerar stabilt inom uppsatta krav.',
    findings: [
      stats.cpk !== null
        ? `Hög kortsiktig kapabilitet (Cpk = ${stats.cpk.toFixed(2)}) och långsiktig prestanda (Ppk = ${stats.ppk?.toFixed(2) ?? '–'}).`
        : 'Stabil mätserie utan avvikelser.',
      stats.isNormal
        ? `Normalfördelningsantagandet stöds (p = ${stats.normalityPValue?.toFixed(3)}).`
        : 'Tillräcklig stabilitet för löpande stickprovskontroll.',
    ],
  };
}

export function suggestSpecLimits(values: number[]): { usl: number; lsl: number; target: number } {
  if (values.length === 0) {
    return { usl: 11.5, lsl: 8.5, target: 10.0 };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1)
      : 0;
  const sd = Math.sqrt(variance);
  const halfTol = sd > 1e-6 ? sd * 4.2 : Math.max(Math.abs(mean) * 0.1, 1);

  const roundSmart = (val: number) => {
    const abs = Math.abs(halfTol);
    const decimals = abs < 0.1 ? 4 : abs < 1 ? 3 : abs < 10 ? 2 : 1;
    return Number(val.toFixed(decimals));
  };

  return {
    lsl: roundSmart(mean - halfTol),
    usl: roundSmart(mean + halfTol),
    target: roundSmart(mean),
  };
}

export const SAMPLE_DATASET_SPECS: Record<string, { usl: number; lsl: number; target: number }> = {
  'Diameter (mm)': { lsl: 9.2, usl: 10.8, target: 10.0 },
  'Ytfinhet Ra (µm)': { lsl: 0.8, usl: 2.4, target: 1.6 },
  'Kylvätsketemp (°C)': { lsl: 18.0, usl: 27.0, target: 22.0 },
  'Matning (mm/varv)': { lsl: 0.12, usl: 0.28, target: 0.2 },
  'Spindelvarvtal (RPM)': { lsl: 2200, usl: 2800, target: 2500 },
};

export function generateSampleDataset(count: number = 60): {
  rows: ProductionRow[];
  columns: string[];
  categoryColumns: string[];
  datasetName: string;
} {
  const rows: ProductionRow[] = [];
  const now = Date.now();

  // Realistic CNC batch with 3 shifts, 2 machines, thermal coolant drift, feed rate impact, and 1 special-cause spike
  for (let i = 0; i < count; i++) {
    const randNorm = () => {
      const u1 = Math.max(Math.random(), 1e-10);
      const u2 = Math.random();
      return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    };

    const shift =
      i < Math.floor(count / 3)
        ? 'Skift A'
        : i < Math.floor((2 * count) / 3)
        ? 'Skift B'
        : 'Skift C';
    const machine = i % 2 === 0 ? 'CNC-01' : 'CNC-02';
    const machineOffset = machine === 'CNC-02' ? 0.045 : -0.02;

    // Process input factors (X)
    const feedRate = Number(Math.max(0.13, Math.min(0.27, 0.2 + randNorm() * 0.028)).toFixed(4));
    const spindleRpm = Number((2500 + randNorm() * 95).toFixed(1));
    const coolantTemp = Number(
      (21.4 + randNorm() * 0.75 + (i >= count - 16 ? (i - (count - 16)) * 0.22 : 0)).toFixed(2)
    );

    // Quality outputs (Y) driven realistically by coolantTemp + feedRate + noise
    let diameter =
      10.0 +
      machineOffset +
      (coolantTemp - 21.8) * 0.115 +
      (feedRate - 0.2) * 2.1 +
      randNorm() * 0.11;
    if (i === 28) {
      diameter += 0.88; // clear special cause spike
    }

    const roughness = Math.max(
      0.65,
      1.55 + (feedRate - 0.2) * 5.2 + (coolantTemp - 21.8) * 0.04 + randNorm() * 0.1
    );

    const date = new Date(now - (count - i) * 300_000); // 5 min intervals
    rows.push({
      rowIndex: i + 1,
      timestamp: date.toISOString(),
      label: date.toLocaleString('sv-SE', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      values: {
        'Diameter (mm)': Number(diameter.toFixed(4)),
        'Ytfinhet Ra (µm)': Number(roughness.toFixed(3)),
        'Kylvätsketemp (°C)': coolantTemp,
        'Matning (mm/varv)': feedRate,
        'Spindelvarvtal (RPM)': spindleRpm,
      },
      categories: {
        Skift: shift,
        Maskin: machine,
      },
    });
  }

  return {
    rows,
    columns: [
      'Diameter (mm)',
      'Ytfinhet Ra (µm)',
      'Kylvätsketemp (°C)',
      'Matning (mm/varv)',
      'Spindelvarvtal (RPM)',
    ],
    categoryColumns: ['Skift', 'Maskin'],
    datasetName: 'CNC-axel Ø10 mm (Exempeldata)',
  };
}
