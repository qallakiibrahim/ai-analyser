import {
  ChartPoint,
  ProductionRow,
  SpecLimits,
  StatsResult,
  calculateStats,
} from './stats';
import { studentTTwoTailedP } from './advancedStats';

export type StagingMode = 'none' | 'auto' | 'manual' | 'category';

export interface StageSummary {
  stageIndex: number; // 1-based
  label: string;
  startRow: number;
  endRow: number;
  count: number;
  stats: StatsResult;
}

export interface StagedChartPoint extends ChartPoint {
  stageIndex: number;
  stageLabel: string;
  stageMean: number;
  stageUcl: number;
  stageLcl: number;
  stageMrBar: number;
  stageUclMr: number;
  isStageStart: boolean;
}

export interface StagedSeriesResult {
  mode: StagingMode;
  stages: StageSummary[];
  points: StagedChartPoint[];
  splitRows: number[];
  autoNote: string | null;
}

/**
 * Automatic Change-Point Detection (Recursive Binary Segmentation with Welch t-test +
 * practical shift guard) to automatically detect process stages in SPC series.
 */
export function detectAutomaticStageSplits(
  rows: ProductionRow[],
  metric: string,
  maxSplits: number = 4
): number[] {
  const valid = rows
    .filter((r) => typeof r.values[metric] === 'number' && Number.isFinite(r.values[metric]))
    .map((r) => ({ rowIndex: r.rowIndex, value: r.values[metric] }));

  const n = valid.length;
  const minSeg = Math.max(8, Math.min(14, Math.floor(n / 6)));
  if (n < minSeg * 2) return [];

  // Estimate global short-term sigma_within via MR-bar / 1.128 as noise baseline
  let sumMr = 0;
  for (let i = 1; i < n; i++) {
    sumMr += Math.abs(valid[i].value - valid[i - 1].value);
  }
  const sigmaWithin = sumMr / Math.max(1, n - 1) / 1.128;
  if (sigmaWithin <= 1e-12) return [];

  const splitIndices: number[] = [];

  const findBestSplitInRange = (
    startIdx: number,
    endIdx: number
  ): { splitIdx: number; score: number; pValue: number; shiftInSigma: number } | null => {
    const len = endIdx - startIdx;
    if (len < minSeg * 2) return null;

    // Prefix sums & prefix sums of squares for O(n) exact segment mean/variance
    const prefSum = new Float64Array(len + 1);
    const prefSq = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) {
      const v = valid[startIdx + i].value;
      prefSum[i + 1] = prefSum[i] + v;
      prefSq[i + 1] = prefSq[i] + v * v;
    }

    let best: { splitIdx: number; score: number; pValue: number; shiftInSigma: number } | null =
      null;

    for (let cut = minSeg; cut <= len - minSeg; cut++) {
      const n1 = cut;
      const n2 = len - cut;
      const m1 = prefSum[cut] / n1;
      const m2 = (prefSum[len] - prefSum[cut]) / n2;

      const ss1 = Math.max(0, prefSq[cut] - n1 * m1 * m1);
      const ss2 = Math.max(0, prefSq[len] - prefSq[cut] - n2 * m2 * m2);
      const v1 = ss1 / Math.max(1, n1 - 1);
      const v2 = ss2 / Math.max(1, n2 - 1);

      const se2 = v1 / n1 + v2 / n2;
      if (se2 <= 1e-15) continue;

      const diff = Math.abs(m2 - m1);
      const tAbs = diff / Math.sqrt(se2);
      const dfNum = se2 * se2;
      const dfDen =
        Math.pow(v1 / n1, 2) / Math.max(1, n1 - 1) +
        Math.pow(v2 / n2, 2) / Math.max(1, n2 - 1);
      const df = dfDen > 1e-15 ? dfNum / dfDen : n1 + n2 - 2;
      const pValue = studentTTwoTailedP(tAbs, df);
      const shiftInSigma = diff / sigmaWithin;

      // Score combines statistical strength and practical shift magnitude
      if (!best || tAbs > best.score) {
        best = {
          splitIdx: startIdx + cut,
          score: tAbs,
          pValue,
          shiftInSigma,
        };
      }
    }

    if (!best) return null;

    // Multiplicity-adjusted significance + practical shift guard (>= 0.65 sigma_within)
    // catches genuine process level shifts/drifts while staying quiet on stationary noise
    const alphaThreshold = 0.01 / Math.max(1, Math.log2(len));
    if (best.pValue < alphaThreshold && best.shiftInSigma >= 0.65) {
      return best;
    }
    return null;
  };

  // Iteratively split the segment with the strongest statistically significant shift
  const segments: Array<[number, number]> = [[0, n]];
  while (splitIndices.length < maxSplits) {
    let bestSegIdx = -1;
    let bestCand: { splitIdx: number; score: number; pValue: number; shiftInSigma: number } | null =
      null;

    for (let s = 0; s < segments.length; s++) {
      const [lo, hi] = segments[s];
      const cand = findBestSplitInRange(lo, hi);
      if (cand && (!bestCand || cand.score > bestCand.score)) {
        bestCand = cand;
        bestSegIdx = s;
      }
    }

    if (bestSegIdx === -1 || !bestCand) break;

    const [lo, hi] = segments[bestSegIdx];
    splitIndices.push(bestCand.splitIdx);
    segments.splice(bestSegIdx, 1, [lo, bestCand.splitIdx], [bestCand.splitIdx, hi]);
  }

  return splitIndices
    .sort((a, b) => a - b)
    .map((idx) => valid[idx].rowIndex);
}

/**
 * Builds staged control chart series with independent UCL, CL, LCL, MR-bar, UCL_MR, and Cpk/Ppk per stage.
 */
export function buildStagedChartSeries(
  rows: ProductionRow[],
  series: ChartPoint[],
  metric: string,
  spec: SpecLimits,
  globalStats: StatsResult,
  mode: StagingMode,
  manualSplitRows: number[],
  categoryColumn: string
): StagedSeriesResult {
  if (series.length === 0) {
    return {
      mode,
      stages: [],
      points: [],
      splitRows: [],
      autoNote: null,
    };
  }

  // Fast path: no staging (1 single stage using globalStats)
  if (mode === 'none') {
    const singleStage: StageSummary = {
      stageIndex: 1,
      label: 'Hela serien',
      startRow: series[0].rowIndex,
      endRow: series[series.length - 1].rowIndex,
      count: series.length,
      stats: globalStats,
    };
    const points: StagedChartPoint[] = series.map((pt, idx) => ({
      ...pt,
      stageIndex: 1,
      stageLabel: singleStage.label,
      stageMean: globalStats.mean,
      stageUcl: globalStats.ucl,
      stageLcl: globalStats.lcl,
      stageMrBar: globalStats.mrBar,
      stageUclMr: globalStats.uclMr,
      isStageStart: idx === 0,
    }));
    return { mode, stages: [singleStage], points, splitRows: [], autoNote: null };
  }

  // Determine stage buckets
  const rowMap = new Map<number, ProductionRow>();
  for (const r of rows) rowMap.set(r.rowIndex, r);

  interface Bucket {
    label: string;
    points: ChartPoint[];
  }

  const buckets: Bucket[] = [];
  let resolvedSplitRows: number[] = [];
  let autoNote: string | null = null;

  if (mode === 'category' && categoryColumn) {
    let currentLabel = '';
    let currentPoints: ChartPoint[] = [];
    for (const pt of series) {
      const catVal = rowMap.get(pt.rowIndex)?.categories?.[categoryColumn]?.trim() || 'Okänd';
      if (currentPoints.length === 0) {
        currentLabel = catVal;
        currentPoints = [pt];
      } else if (catVal === currentLabel) {
        currentPoints.push(pt);
      } else {
        buckets.push({ label: currentLabel, points: currentPoints });
        resolvedSplitRows.push(pt.rowIndex);
        currentLabel = catVal;
        currentPoints = [pt];
      }
    }
    if (currentPoints.length > 0) {
      buckets.push({ label: currentLabel, points: currentPoints });
    }
  } else {
    if (mode === 'auto') {
      resolvedSplitRows = detectAutomaticStageSplits(rows, metric, 4);
      autoNote =
        resolvedSplitRows.length > 0
          ? `Automatisk skiftdetektering hittade ${resolvedSplitRows.length} tydlig${
              resolvedSplitRows.length === 1 ? 't' : 'a'
            } processkift (rad ${resolvedSplitRows.map((r) => `#${r}`).join(', ')}) och delade in grafen i ${
              resolvedSplitRows.length + 1
            } steg.`
          : 'Inga statistiskt signifikanta nivåskift hittades — processen visas som ett sammanhängande steg.';
    } else {
      const minRow = series[0].rowIndex;
      const maxRow = series[series.length - 1].rowIndex;
      resolvedSplitRows = Array.from(
        new Set(manualSplitRows.filter((r) => r > minRow && r <= maxRow))
      ).sort((a, b) => a - b);
    }

    let stageNum = 1;
    let currentPoints: ChartPoint[] = [];
    let splitPointer = 0;

    for (const pt of series) {
      while (
        splitPointer < resolvedSplitRows.length &&
        pt.rowIndex >= resolvedSplitRows[splitPointer]
      ) {
        if (currentPoints.length > 0) {
          buckets.push({
            label: mode === 'auto' ? `Auto Steg ${stageNum}` : `Steg ${stageNum}`,
            points: currentPoints,
          });
          stageNum++;
          currentPoints = [];
        }
        splitPointer++;
      }
      currentPoints.push(pt);
    }
    if (currentPoints.length > 0) {
      buckets.push({
        label: mode === 'auto' ? `Auto Steg ${stageNum}` : `Steg ${stageNum}`,
        points: currentPoints,
      });
    }
  }

  // Fallback if somehow empty
  if (buckets.length === 0) {
    buckets.push({ label: 'Steg 1', points: series });
  }

  // Compute independent SPC statistics per stage & reset MR at stage boundary (Minitab convention)
  const stages: StageSummary[] = [];
  const stagedPoints: StagedChartPoint[] = [];

  buckets.forEach((bucket, idx) => {
    const stageIdx = idx + 1;
    const vals = bucket.points.map((p) => p.value);
    const st = calculateStats(vals, spec.usl, spec.lsl, spec.target);
    stages.push({
      stageIndex: stageIdx,
      label: bucket.label,
      startRow: bucket.points[0].rowIndex,
      endRow: bucket.points[bucket.points.length - 1].rowIndex,
      count: bucket.points.length,
      stats: st,
    });

    bucket.points.forEach((pt, localIdx) => {
      const mr = localIdx === 0 ? null : Math.abs(pt.value - bucket.points[localIdx - 1].value);
      const mrOutOfControl = mr !== null && st.mrBar > 1e-12 && mr > st.uclMr;
      stagedPoints.push({
        ...pt,
        mr,
        mrOutOfControl,
        stageIndex: stageIdx,
        stageLabel: bucket.label,
        stageMean: st.mean,
        stageUcl: st.ucl,
        stageLcl: st.lcl,
        stageMrBar: st.mrBar,
        stageUclMr: st.uclMr,
        isStageStart: localIdx === 0,
      });
    });
  });

  return {
    mode,
    stages,
    points: stagedPoints,
    splitRows: resolvedSplitRows,
    autoNote,
  };
}
