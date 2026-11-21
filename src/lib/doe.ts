import { studentTTwoTailedP, fDistUpperTailP } from './advancedStats';
import { studentTCritical05 } from './regression';

export type DoeFactorType = 'numeric' | 'text';

export interface DoeFactor {
  id: string;
  code: string; // 'A', 'B', 'C', 'D', 'E'
  name: string;
  unit: string;
  type?: DoeFactorType; // defaults to 'numeric'
  low: number;
  high: number;
  lowText?: string;
  highText?: string;
}

export type DoeDesignType = '2^2' | '2^3' | '2^4-1' | '2^4' | '2^5-1' | '2^5';
export type DoeGoal = 'minimize' | 'maximize' | 'target';

export interface DoeRun {
  id: string;
  stdOrder: number;
  runOrder: number;
  replicate: number;
  pointType: 'corner' | 'center';
  coded: Record<string, number>; // e.g. { A: -1, B: 1, C: -1 }
  actual: Record<string, number>; // e.g. { A: 120, B: 0.28, C: 0.5 }
  response: number | null;
}

export interface DoeEffectRow {
  id: string;
  code: string; // e.g. 'A', 'B', 'AB'
  label: string; // e.g. 'Matning', 'Skärhastighet × Matning'
  aliasNote: string | null; // e.g. '= CD' for 2^(4-1)
  isInteraction: boolean;
  factors: string[]; // factor codes e.g. ['A'] or ['A', 'B']
  effect: number; // 2 * codedCoef (change from -1 to +1)
  coef: number; // coded coefficient
  stdError: number | null;
  tStat: number | null;
  pValue: number | null;
  absDisplayValue: number; // |t| when dfError > 0, or |effect| when Lenth's method is used
  isSignificant: boolean;
}

export interface MainEffectPlotSeries {
  code: string;
  name: string;
  unit: string;
  lowLevel: number;
  highLevel: number;
  lowMean: number;
  highMean: number;
  delta: number;
}

export interface InteractionPlotData {
  factorA: DoeFactor;
  factorB: DoeFactor;
  points: Array<{
    levelALabel: string;
    levelAValue: number;
    bLowMean: number | null;
    bHighMean: number | null;
  }>;
  interactionEffect: number;
}

export interface DoeCurvatureCheck {
  hasCenterPoints: boolean;
  centerCount: number;
  cornerMean: number;
  centerMean: number | null;
  difference: number | null;
  pValue: number | null;
  isSignificant: boolean;
  message: string;
}

export interface DoeOptimizationResult {
  goal: DoeGoal;
  targetValue: number;
  codedSettings: Record<string, number>;
  actualSettings: Record<string, number>;
  predictedY: number;
}

export interface DoeAnalysisResult {
  nTotal: number;
  nCompleted: number;
  grandMean: number;
  cornerMean: number;
  dfModel: number;
  dfError: number;
  rSquared: number;
  adjRSquared: number;
  rmse: number | null;
  fStat: number | null;
  modelPValue: number | null;
  inferenceMethod: 'ols-t' | 'lenth';
  paretoThreshold: number;
  paretoMetricLabel: string;
  interceptCoded: number;
  effects: DoeEffectRow[];
  mainEffectsPlot: MainEffectPlotSeries[];
  curvature: DoeCurvatureCheck;
  codedEquation: string;
  actualEquation: string;
  summaryVerdict: string;
  aliasSummary: string | null;
}

const CODES = ['A', 'B', 'C', 'D', 'E'] as const;

export interface DoeDesignOption {
  id: DoeDesignType;
  shortLabel: string;
  label: string;
  corners: number;
  resolution: 'Full' | 'Res V' | 'Res IV';
  hint: string;
}

export function getFactorCountForDesign(design: DoeDesignType): number {
  if (design === '2^2') return 2;
  if (design === '2^3') return 3;
  if (design === '2^4-1' || design === '2^4') return 4;
  return 5;
}

export function getDesignsForFactorCount(factorCount: number): DoeDesignOption[] {
  if (factorCount <= 2) {
    return [
      {
        id: '2^2',
        shortLabel: 'Full faktoriell (4 hörn)',
        label: '2² Full faktoriell (4 hörn)',
        corners: 4,
        resolution: 'Full',
        hint: 'Alla huvudeffekter och samspel är helt fria.',
      },
    ];
  }
  if (factorCount === 3) {
    return [
      {
        id: '2^3',
        shortLabel: 'Full faktoriell (8 hörn)',
        label: '2³ Full faktoriell (8 hörn)',
        corners: 8,
        resolution: 'Full',
        hint: 'Standardvalet för 3 faktorer — alla samspel (AB, AC, BC) helt fria.',
      },
    ];
  }
  if (factorCount === 4) {
    return [
      {
        id: '2^4-1',
        shortLabel: 'Halvfraktion Res IV (8 hörn)',
        label: '2⁴⁻¹ Halvfraktion Res IV (8 hörn)',
        corners: 8,
        resolution: 'Res IV',
        hint: 'Halverar antalet körningar. Huvudeffekter är fria; 2-samspel är parade (AB=CD).',
      },
      {
        id: '2^4',
        shortLabel: 'Full faktoriell (16 hörn)',
        label: '2⁴ Full faktoriell (16 hörn)',
        corners: 16,
        resolution: 'Full',
        hint: 'Alla huvudeffekter och samtliga 2-faktorssamspel är helt fria.',
      },
    ];
  }
  return [
    {
      id: '2^5-1',
      shortLabel: 'Halvfraktion Res V (16 hörn)',
      label: '2⁵⁻¹ Halvfraktion Res V (16 hörn)',
      corners: 16,
      resolution: 'Res V',
      hint: 'Minitabs favorit för 5 faktorer: alla huvudeffekter och alla 2-samspel är helt fria.',
    },
    {
      id: '2^5',
      shortLabel: 'Full faktoriell (32 hörn)',
      label: '2⁵ Full faktoriell (32 hörn)',
      corners: 32,
      resolution: 'Full',
      hint: 'Fullständig 32-körningars plan för maximal upplösning.',
    },
  ];
}

export function getDefaultDesignForFactorCount(factorCount: number): DoeDesignType {
  const opts = getDesignsForFactorCount(factorCount);
  return opts[0].id;
}

export function getDesignLabel(design: DoeDesignType): string {
  switch (design) {
    case '2^2':
      return '2² Full faktoriell (4 hörn)';
    case '2^3':
      return '2³ Full faktoriell (8 hörn)';
    case '2^4-1':
      return '2⁴⁻¹ Halvfraktion Res IV (8 hörn)';
    case '2^4':
      return '2⁴ Full faktoriell (16 hörn)';
    case '2^5-1':
      return '2⁵⁻¹ Halvfraktion Res V (16 hörn)';
    case '2^5':
      return '2⁵ Full faktoriell (32 hörn)';
  }
}

export function codedToActual(codedVal: number, low: number, high: number): number {
  const center = (low + high) / 2;
  const half = (high - low) / 2;
  const raw = center + codedVal * half;
  const span = Math.abs(high - low);
  const dec = span < 1 ? 4 : span < 20 ? 3 : span < 200 ? 2 : 1;
  return Number(raw.toFixed(dec));
}

export function actualToCoded(actualVal: number, low: number, high: number): number {
  const center = (low + high) / 2;
  const half = (high - low) / 2;
  if (Math.abs(half) < 1e-12) return 0;
  const raw = (actualVal - center) / half;
  return Number(raw.toFixed(4));
}

export function formatFactorLevel(
  factor: DoeFactor,
  codedVal: number,
  actualVal?: number
): string {
  if (factor.type === 'text') {
    if (codedVal < -0.25) return factor.lowText?.trim() || 'Låg (−)';
    if (codedVal > 0.25) return factor.highText?.trim() || 'Hög (+)';
    return 'Centrum';
  }
  const num = actualVal ?? codedToActual(codedVal, factor.low, factor.high);
  return factor.unit ? `${num} ${factor.unit}` : String(num);
}

export function createDefaultFactors(): DoeFactor[] {
  return [
    { id: 'A', code: 'A', name: 'Faktor A', unit: '', type: 'numeric', low: -1, high: 1, lowText: 'Låg', highText: 'Hög' },
    { id: 'B', code: 'B', name: 'Faktor B', unit: '', type: 'numeric', low: -1, high: 1, lowText: 'Låg', highText: 'Hög' },
    { id: 'C', code: 'C', name: 'Faktor C', unit: '', type: 'numeric', low: -1, high: 1, lowText: 'Låg', highText: 'Hög' },
    { id: 'D', code: 'D', name: 'Faktor D', unit: '', type: 'numeric', low: -1, high: 1, lowText: 'Låg', highText: 'Hög' },
    { id: 'E', code: 'E', name: 'Faktor E', unit: '', type: 'numeric', low: -1, high: 1, lowText: 'Låg', highText: 'Hög' },
  ];
}

export function generateDoeDesign(
  design: DoeDesignType,
  factors: DoeFactor[],
  replicates: number = 1,
  centerPoints: number = 3,
  randomize: boolean = true
): DoeRun[] {
  const k = getFactorCountForDesign(design);
  const activeFactors = factors.slice(0, k);
  const safeReps = Math.max(1, Math.min(3, Math.floor(replicates)));
  const safeCenters = Math.max(0, Math.min(6, Math.floor(centerPoints)));

  // Base corner matrix in standard Yates order
  const baseCorners: Array<Record<string, number>> = [];
  if (design === '2^4-1') {
    // 8-run Resolution IV fractional factorial: D = A * B * C
    for (let idx = 0; idx < 8; idx++) {
      const a = (idx & 1) ? 1 : -1;
      const b = (idx & 2) ? 1 : -1;
      const c = (idx & 4) ? 1 : -1;
      const d = a * b * c;
      baseCorners.push({ A: a, B: b, C: c, D: d });
    }
  } else if (design === '2^5-1') {
    // 16-run Resolution V fractional factorial: E = A * B * C * D
    for (let idx = 0; idx < 16; idx++) {
      const a = (idx & 1) ? 1 : -1;
      const b = (idx & 2) ? 1 : -1;
      const c = (idx & 4) ? 1 : -1;
      const d = (idx & 8) ? 1 : -1;
      const e = a * b * c * d;
      baseCorners.push({ A: a, B: b, C: c, D: d, E: e });
    }
  } else {
    const cornerCount = 1 << k;
    for (let idx = 0; idx < cornerCount; idx++) {
      const coded: Record<string, number> = {};
      for (let bit = 0; bit < k; bit++) {
        coded[CODES[bit]] = (idx & (1 << bit)) ? 1 : -1;
      }
      baseCorners.push(coded);
    }
  }

  const runs: DoeRun[] = [];
  let stdCounter = 1;

  for (let rep = 1; rep <= safeReps; rep++) {
    for (const coded of baseCorners) {
      const actual: Record<string, number> = {};
      for (const f of activeFactors) {
        actual[f.code] = codedToActual(coded[f.code], f.low, f.high);
      }
      runs.push({
        id: `run-${stdCounter}`,
        stdOrder: stdCounter,
        runOrder: stdCounter,
        replicate: rep,
        pointType: 'corner',
        coded: { ...coded },
        actual,
        response: null,
      });
      stdCounter++;
    }
  }

  for (let cp = 0; cp < safeCenters; cp++) {
    const coded: Record<string, number> = {};
    const actual: Record<string, number> = {};
    for (const f of activeFactors) {
      coded[f.code] = 0;
      actual[f.code] = codedToActual(0, f.low, f.high);
    }
    runs.push({
      id: `run-${stdCounter}`,
      stdOrder: stdCounter,
      runOrder: stdCounter,
      replicate: 1,
      pointType: 'center',
      coded,
      actual,
      response: null,
    });
    stdCounter++;
  }

  if (randomize) {
    return randomizeRunOrder(runs);
  }
  return runs;
}

export function randomizeRunOrder(runs: DoeRun[]): DoeRun[] {
  const order = runs.map((_, idx) => idx + 1);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return runs
    .map((r, idx) => ({ ...r, runOrder: order[idx] }))
    .sort((a, b) => a.runOrder - b.runOrder);
}

/**
 * Generates a realistic pre-filled 2³ + 3 center points CNC surface roughness (Ra) experiment
 * with a strong main effect of Feed Rate, a strong Speed × Feed interaction, and negligible Depth effect.
 */
export function createSampleDoeExperiment(): {
  experimentName: string;
  responseName: string;
  responseUnit: string;
  design: DoeDesignType;
  goal: DoeGoal;
  targetValue: number;
  factors: DoeFactor[];
  runs: DoeRun[];
} {
  const factors: DoeFactor[] = [
    { id: 'A', code: 'A', name: 'Skärhastighet', unit: 'm/min', type: 'numeric', low: 120, high: 200, lowText: 'Låg', highText: 'Hög' },
    { id: 'B', code: 'B', name: 'Matning', unit: 'mm/varv', type: 'numeric', low: 0.12, high: 0.28, lowText: 'Låg', highText: 'Hög' },
    { id: 'C', code: 'C', name: 'Skärdjup', unit: 'mm', type: 'numeric', low: 0.5, high: 1.5, lowText: 'Låg', highText: 'Hög' },
    { id: 'D', code: 'D', name: 'Kylvätsketryck', unit: 'bar', type: 'numeric', low: 10, high: 25, lowText: 'Låg', highText: 'Hög' },
    { id: 'E', code: 'E', name: 'Skärgeometri', unit: '', type: 'text', low: -1, high: 1, lowText: 'Standard', highText: 'Belagd' },
  ];

  const baseRuns = generateDoeDesign('2^3', factors, 1, 3, false);

  // Realistic deterministic surface roughness measurements Ra (µm):
  // True underlying physics: Ra ≈ 1.48 - 0.21*A + 0.34*B + 0.03*C - 0.16*A*B + small experimental noise
  const noise = [0.02, -0.03, 0.01, 0.04, -0.02, 0.03, -0.01, -0.03, 0.02, -0.02, 0.01];
  const runs: DoeRun[] = baseRuns.map((r, idx) => {
    const a = r.coded.A ?? 0;
    const b = r.coded.B ?? 0;
    const c = r.coded.C ?? 0;
    const y = 1.48 - 0.21 * a + 0.34 * b + 0.03 * c - 0.16 * a * b + (noise[idx] ?? 0);
    return {
      ...r,
      response: Number(y.toFixed(3)),
    };
  });

  return {
    experimentName: 'CNC-svarvning — Ytfinhetsoptimering (2³ + 3 centrum)',
    responseName: 'Ytfinhet Ra',
    responseUnit: 'µm',
    design: '2^3',
    goal: 'minimize',
    targetValue: 1.1,
    factors,
    runs,
  };
}

export function createBlankDoeExperiment(
  factorCount: number = 3,
  replicates: number = 1,
  centerPoints: number = 2,
  randomize: boolean = false
): {
  experimentName: string;
  responseName: string;
  responseUnit: string;
  design: DoeDesignType;
  goal: DoeGoal;
  targetValue: number;
  factors: DoeFactor[];
  runs: DoeRun[];
} {
  const safeCount = Math.max(2, Math.min(5, Math.floor(factorCount)));
  const design = getDefaultDesignForFactorCount(safeCount);
  const factors = createDefaultFactors();
  const runs = generateDoeDesign(design, factors, replicates, centerPoints, randomize);
  return {
    experimentName: `Nytt faktorförsök (${getDesignLabel(design)})`,
    responseName: 'Resultat',
    responseUnit: '',
    design,
    goal: 'minimize',
    targetValue: 0,
    factors,
    runs,
  };
}

// --- Matrix Inversion for Exact Coded-Unit OLS ---

function invertMatrix(mat: number[][]): number[][] | null {
  const n = mat.length;
  const aug: number[][] = mat.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(aug[r][col]);
      if (v > maxAbs) {
        maxAbs = v;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-11) return null;
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const pv = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

function medianValue(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Lenth's method (PSE + Margin of Error) for unreplicated saturated designs where dfError === 0.
 * Matches Minitab's exact Pareto threshold when no residual degrees of freedom exist.
 */
function lenthMarginOfError(effects: number[]): { pse: number; me: number } {
  const m = effects.length;
  if (m === 0) return { pse: 0, me: 0 };
  const absEffects = effects.map((e) => Math.abs(e));
  const s0 = 1.5 * medianValue(absEffects);
  const retained = absEffects.filter((e) => e < 2.5 * s0);
  const pse = 1.5 * medianValue(retained.length > 0 ? retained : absEffects);
  const lenthDf = Math.max(1, m / 3);
  const tCrit = studentTCritical05(lenthDf);
  return { pse, me: tCrit * pse };
}

interface ModelTermDef {
  id: string;
  code: string;
  label: string;
  factors: string[];
  isInteraction: boolean;
  aliasNote: string | null;
}

function buildDoeTerms(
  design: DoeDesignType,
  factors: DoeFactor[],
  includeInteractions: boolean
): { terms: ModelTermDef[]; aliasSummary: string | null } {
  const k = getFactorCountForDesign(design);
  const active = factors.slice(0, k);
  const terms: ModelTermDef[] = active.map((f) => ({
    id: f.code,
    code: f.code,
    label: f.name,
    factors: [f.code],
    isInteraction: false,
    aliasNote:
      design === '2^4-1'
        ? 'Tydlig (Res IV)'
        : design === '2^5-1'
        ? 'Tydlig (Res V)'
        : null,
  }));

  let aliasSummary: string | null = null;

  if (includeInteractions) {
    if (design === '2^4-1') {
      // Resolution IV fractional factorial: only 3 independent 2FI columns (AB=CD, AC=BD, AD=BC)
      const pairs: Array<[number, number, string]> = [
        [0, 1, 'Aliasad med C×D'],
        [0, 2, 'Aliasad med B×D'],
        [0, 3, 'Aliasad med B×C'],
      ];
      for (const [i, j, alias] of pairs) {
        terms.push({
          id: `${active[i].code}${active[j].code}`,
          code: `${active[i].code}×${active[j].code}`,
          label: `${active[i].name} × ${active[j].name}`,
          factors: [active[i].code, active[j].code],
          isInteraction: true,
          aliasNote: alias,
        });
      }
      aliasSummary =
        'Halvfraktion 2⁴⁻¹ (Upplösning IV, generator D = A·B·C): Huvudeffekter är fria från 2-faktorssamspel, medan 2-faktorssamspel är parade: AB = CD, AC = BD och AD = BC.';
    } else {
      if (design === '2^5-1') {
        aliasSummary =
          'Halvfraktion 2⁵⁻¹ (Upplösning V, generator E = A·B·C·D): Både samtliga 5 huvudeffekter och samtliga 10 tvåfaktorssamspel är helt fria från varandra.';
      }
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          terms.push({
            id: `${active[i].code}${active[j].code}`,
            code: `${active[i].code}×${active[j].code}`,
            label: `${active[i].name} × ${active[j].name}`,
            factors: [active[i].code, active[j].code],
            isInteraction: true,
            aliasNote: null,
          });
        }
      }
    }
  }

  return { terms, aliasSummary };
}

export function analyzeDoe(
  design: DoeDesignType,
  factors: DoeFactor[],
  runs: DoeRun[],
  responseName: string,
  includeInteractions: boolean = true
): DoeAnalysisResult | null {
  const k = getFactorCountForDesign(design);
  const activeFactors = factors.slice(0, k);

  const completed = runs.filter(
    (r) => r.response !== null && Number.isFinite(r.response)
  );
  if (completed.length < k + 1) return null;

  const { terms: requestedTerms, aliasSummary } = buildDoeTerms(
    design,
    activeFactors,
    includeInteractions
  );

  // If user only filled a partial subset of runs, drop interactions if needed so p <= n
  let terms = requestedTerms;
  if (completed.length < terms.length + 1) {
    terms = buildDoeTerms(design, activeFactors, false).terms;
    if (completed.length < terms.length + 1) return null;
  }

  const n = completed.length;
  const p = terms.length + 1;

  // Build coded design matrix X
  const X: number[][] = completed.map((run) => {
    const row = [1];
    for (const t of terms) {
      let val = 1;
      for (const fCode of t.factors) {
        val *= run.coded[fCode] ?? 0;
      }
      row.push(val);
    }
    return row;
  });

  const yVals = completed.map((r) => r.response as number);
  const grandMean = yVals.reduce((a, b) => a + b, 0) / n;

  const cornerRuns = completed.filter((r) => r.pointType === 'corner');
  const centerRuns = completed.filter((r) => r.pointType === 'center');
  const cornerMean =
    cornerRuns.length > 0
      ? cornerRuns.reduce((s, r) => s + (r.response as number), 0) / cornerRuns.length
      : grandMean;

  // Normal equations X^T X and X^T y
  const xtx: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const xty: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      xty[j] += X[i][j] * yVals[i];
      for (let m = j; m < p; m++) {
        xtx[j][m] += X[i][j] * X[i][m];
      }
    }
  }
  for (let j = 0; j < p; j++) {
    for (let m = 0; m < j; m++) xtx[j][m] = xtx[m][j];
  }

  const xtxInv = invertMatrix(xtx);
  if (!xtxInv) return null;

  const beta: number[] = Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let m = 0; m < p; m++) s += xtxInv[j][m] * xty[m];
    beta[j] = s;
  }

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    let yHat = 0;
    for (let j = 0; j < p; j++) yHat += X[i][j] * beta[j];
    const res = yVals[i] - yHat;
    ssRes += res * res;
    ssTot += (yVals[i] - grandMean) * (yVals[i] - grandMean);
  }

  const dfModel = terms.length;
  const dfError = n - p;
  const rSquared = ssTot > 1e-15 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
  const adjRSquared =
    dfError > 0 && ssTot > 1e-15
      ? 1 - ((1 - rSquared) * (n - 1)) / dfError
      : rSquared;

  const useOlsT = dfError >= 1;
  const mse = useOlsT ? ssRes / dfError : null;
  const rmse = mse !== null ? Math.sqrt(mse) : null;

  let fStat: number | null = null;
  let modelPValue: number | null = null;
  if (useOlsT && mse !== null) {
    const msModel = (ssTot - ssRes) / Math.max(1, dfModel);
    if (mse > 1e-24) {
      fStat = Math.max(0, msModel / mse);
      modelPValue = fStat > 0 ? fDistUpperTailP(fStat, dfModel, dfError) : 1;
    } else if (msModel > 1e-12) {
      fStat = 999999;
      modelPValue = 0;
    }
  }

  const rawEffects = terms.map((_, idx) => 2 * beta[idx + 1]);
  const tCrit = useOlsT ? studentTCritical05(dfError) : 0;
  const lenth = !useOlsT ? lenthMarginOfError(rawEffects) : { pse: 0, me: 0 };

  const effects: DoeEffectRow[] = terms.map((t, idx) => {
    const coef = beta[idx + 1];
    const effect = 2 * coef;

    if (useOlsT && mse !== null) {
      const se = Math.sqrt(Math.max(0, mse * xtxInv[idx + 1][idx + 1]));
      let tStat = 0;
      let pValue = 1;
      if (se > 1e-18) {
        tStat = coef / se;
        pValue = studentTTwoTailedP(tStat, dfError);
      } else if (Math.abs(coef) > 1e-10) {
        tStat = coef >= 0 ? 999 : -999;
        pValue = 0;
      }
      return {
        id: t.id,
        code: t.code,
        label: t.label,
        aliasNote: t.aliasNote,
        isInteraction: t.isInteraction,
        factors: t.factors,
        effect,
        coef,
        stdError: se,
        tStat,
        pValue,
        absDisplayValue: Number(Math.abs(tStat).toFixed(3)),
        isSignificant: pValue < 0.05,
      };
    }

    // Lenth's method for saturated unreplicated design
    return {
      id: t.id,
      code: t.code,
      label: t.label,
      aliasNote: t.aliasNote,
      isInteraction: t.isInteraction,
      factors: t.factors,
      effect,
      coef,
      stdError: null,
      tStat: null,
      pValue: null,
      absDisplayValue: Number(Math.abs(effect).toFixed(4)),
      isSignificant:
        lenth.me > 1e-9 ? Math.abs(effect) >= lenth.me : Math.abs(effect) > 1e-6,
    };
  });

  // Main Effects Plot data (average Y on low vs high side; supports both exact ±1 and edited actuals)
  const mainEffectsPlot: MainEffectPlotSeries[] = activeFactors.map((f) => {
    const lowVals = cornerRuns
      .filter((r) => (r.coded[f.code] ?? 0) <= -0.25)
      .map((r) => r.response as number);
    const highVals = cornerRuns
      .filter((r) => (r.coded[f.code] ?? 0) >= 0.25)
      .map((r) => r.response as number);
    const lowMean =
      lowVals.length > 0 ? lowVals.reduce((a, b) => a + b, 0) / lowVals.length : cornerMean;
    const highMean =
      highVals.length > 0 ? highVals.reduce((a, b) => a + b, 0) / highVals.length : cornerMean;
    return {
      code: f.code,
      name: f.name,
      unit: f.unit,
      lowLevel: f.low,
      highLevel: f.high,
      lowMean,
      highMean,
      delta: highMean - lowMean,
    };
  });

  // Curvature test using Center Points
  let curvature: DoeCurvatureCheck = {
    hasCenterPoints: false,
    centerCount: 0,
    cornerMean,
    centerMean: null,
    difference: null,
    pValue: null,
    isSignificant: false,
    message: 'Inga centrumpunkter i försöket — lägg till 2–3 centrumpunkter för att testa kurvatur.',
  };

  if (centerRuns.length >= 1 && cornerRuns.length >= 2) {
    const centerVals = centerRuns.map((r) => r.response as number);
    const centerMean = centerVals.reduce((a, b) => a + b, 0) / centerVals.length;
    const diff = centerMean - cornerMean;
    let pVal: number | null = null;
    let isSig = false;

    if (centerVals.length >= 2) {
      const varC =
        centerVals.reduce((s, v) => s + Math.pow(v - centerMean, 2), 0) /
        (centerVals.length - 1);
      const sdPure = Math.sqrt(varC);
      const seCurv = sdPure * Math.sqrt(1 / cornerRuns.length + 1 / centerVals.length);
      if (seCurv > 1e-12) {
        const tCurv = diff / seCurv;
        pVal = studentTTwoTailedP(tCurv, centerVals.length - 1);
        isSig = pVal < 0.05;
      }
    }

    curvature = {
      hasCenterPoints: true,
      centerCount: centerVals.length,
      cornerMean,
      centerMean,
      difference: diff,
      pValue: pVal,
      isSignificant: isSig,
      message: isSig
        ? `Signifikant kurvatur detekterad (p = ${pVal!.toFixed(4)}): centrummedel (${centerMean.toFixed(
            3
          )}) skiljer sig från hörnmedel (${cornerMean.toFixed(
            3
          )}). Optimum kan ligga mellan ytterlägena.`
        : centerVals.length >= 2
        ? `Ingen signifikant kurvatur (p = ${
            pVal !== null ? pVal.toFixed(4) : '–'
          }). Linjär faktormodell beskriver processen väl.`
        : `1 centrumpunkt (${centerMean.toFixed(3)} vs hörn ${cornerMean.toFixed(
            3
          )}). Lägg till minst 2 centrumpunkter för formellt p-värde.`,
    };
  }

  // Coded equation string
  const codedParts = [`${responseName} = ${beta[0].toFixed(4)}`];
  for (const ef of effects) {
    const sign = ef.coef >= 0 ? ' + ' : ' − ';
    codedParts.push(`${sign}${Math.abs(ef.coef).toFixed(4)} · ${ef.code}`);
  }
  const codedEquation = codedParts.join('');

  // Actual-units equation string (exact linear + bilinear algebraic expansion from coded -> actual)
  const centerMap: Record<string, number> = {};
  const halfMap: Record<string, number> = {};
  for (const f of activeFactors) {
    if (f.type === 'text') {
      centerMap[f.code] = 0;
      halfMap[f.code] = 1;
    } else {
      centerMap[f.code] = (f.low + f.high) / 2;
      halfMap[f.code] = (f.high - f.low) / 2 || 1;
    }
  }

  let actualConst = beta[0];
  const actualLinear: Record<string, number> = {};
  for (const f of activeFactors) actualLinear[f.code] = 0;
  const actualInter: Array<{ label: string; coef: number }> = [];

  for (const ef of effects) {
    if (!ef.isInteraction) {
      const code = ef.factors[0];
      const slope = ef.coef / halfMap[code];
      actualLinear[code] += slope;
      actualConst -= slope * centerMap[code];
    } else {
      const [c1, c2] = ef.factors;
      const b12 = ef.coef / (halfMap[c1] * halfMap[c2]);
      actualConst += b12 * centerMap[c1] * centerMap[c2];
      actualLinear[c1] -= b12 * centerMap[c2];
      actualLinear[c2] -= b12 * centerMap[c1];
      actualInter.push({ label: ef.label, coef: b12 });
    }
  }

  const actualParts = [`${responseName} = ${actualConst.toFixed(4)}`];
  for (const f of activeFactors) {
    const val = actualLinear[f.code];
    if (Math.abs(val) > 1e-9) {
      actualParts.push(`${val >= 0 ? ' + ' : ' − '}${Math.abs(val).toFixed(4)} · ${f.name}`);
    }
  }
  for (const inter of actualInter) {
    if (Math.abs(inter.coef) > 1e-9) {
      actualParts.push(
        `${inter.coef >= 0 ? ' + ' : ' − '}${Math.abs(inter.coef).toFixed(4)} · (${inter.label})`
      );
    }
  }
  const actualEquation = actualParts.join('');

  const sortedEffects = [...effects].sort((a, b) => b.absDisplayValue - a.absDisplayValue);
  const sigEffects = sortedEffects.filter((e) => e.isSignificant);

  const summaryVerdict =
    sigEffects.length > 0
      ? `Tydligast påverkande faktorer på ${responseName}: ${sigEffects
          .slice(0, 3)
          .map((e) => `${e.label} (${e.effect >= 0 ? '+' : ''}${e.effect.toFixed(3)})`)
          .join(', ')}. Modellen förklarar ${(rSquared * 100).toFixed(1)} % av variationen.`
      : `Inga faktorer passerade signifikansgränsen (${
          useOlsT ? 'α = 0.05' : 'Lenth ME'
        }). Kontrollera mätbrus, utöka faktorintervallen eller lägg till replikat.`;

  return {
    nTotal: runs.length,
    nCompleted: completed.length,
    grandMean,
    cornerMean,
    dfModel,
    dfError,
    rSquared,
    adjRSquared,
    rmse,
    fStat,
    modelPValue,
    inferenceMethod: useOlsT ? 'ols-t' : 'lenth',
    paretoThreshold: useOlsT ? Number(tCrit.toFixed(3)) : Number(lenth.me.toFixed(4)),
    paretoMetricLabel: useOlsT ? '|t-värde|' : '|Effekt| (Lenth)',
    interceptCoded: beta[0],
    effects: sortedEffects,
    mainEffectsPlot,
    curvature,
    codedEquation,
    actualEquation,
    summaryVerdict,
    aliasSummary,
  };
}

export function buildInteractionPlotData(
  runs: DoeRun[],
  factorA: DoeFactor,
  factorB: DoeFactor,
  effects: DoeEffectRow[]
): InteractionPlotData {
  const completedCorners = runs.filter(
    (r) => r.pointType === 'corner' && r.response !== null && Number.isFinite(r.response)
  );

  const avgFor = (aCodeVal: number, bCodeVal: number): number | null => {
    const matches = completedCorners.filter((r) => {
      const ca = r.coded[factorA.code] ?? 0;
      const cb = r.coded[factorB.code] ?? 0;
      const matchA = aCodeVal < 0 ? ca <= -0.25 : ca >= 0.25;
      const matchB = bCodeVal < 0 ? cb <= -0.25 : cb >= 0.25;
      return matchA && matchB;
    });
    if (matches.length === 0) return null;
    return matches.reduce((s, r) => s + (r.response as number), 0) / matches.length;
  };

  const interRow = effects.find(
    (e) =>
      e.isInteraction &&
      e.factors.includes(factorA.code) &&
      e.factors.includes(factorB.code)
  );

  return {
    factorA,
    factorB,
    points: [
      {
        levelALabel: `Låg (${formatFactorLevel(factorA, -1, factorA.low)})`,
        levelAValue: factorA.low,
        bLowMean: avgFor(-1, -1),
        bHighMean: avgFor(-1, 1),
      },
      {
        levelALabel: `Hög (${formatFactorLevel(factorA, 1, factorA.high)})`,
        levelAValue: factorA.high,
        bLowMean: avgFor(1, -1),
        bHighMean: avgFor(1, 1),
      },
    ],
    interactionEffect: interRow?.effect ?? 0,
  };
}

export function predictDoeCoded(
  analysis: DoeAnalysisResult,
  codedSettings: Record<string, number>
): number {
  let y = analysis.interceptCoded;
  for (const ef of analysis.effects) {
    let prod = 1;
    for (const fCode of ef.factors) {
      prod *= codedSettings[fCode] ?? 0;
    }
    y += ef.coef * prod;
  }
  return y;
}

/**
 * Optimizes coded factor levels in [-1, 1]^k using coordinate descent + corner starts
 * to hit Target, Minimize Y, or Maximize Y cleanly.
 */
export function optimizeDoeSettings(
  analysis: DoeAnalysisResult,
  factors: DoeFactor[],
  design: DoeDesignType,
  goal: DoeGoal,
  targetValue: number
): DoeOptimizationResult {
  const k = getFactorCountForDesign(design);
  const active = factors.slice(0, k);

  const objective = (cfg: Record<string, number>): number => {
    const y = predictDoeCoded(analysis, cfg);
    if (goal === 'minimize') return y;
    if (goal === 'maximize') return -y;
    return Math.abs(y - targetValue);
  };

  // Evaluate all 2^k corners + center as starting points so bilinear saddle points are always handled globally
  let bestCfg: Record<string, number> = {};
  for (const f of active) bestCfg[f.code] = 0;
  let bestObj = objective(bestCfg);

  const cornerCount = 1 << k;
  for (let mask = 0; mask < cornerCount; mask++) {
    const cfg: Record<string, number> = {};
    for (let bit = 0; bit < k; bit++) {
      cfg[active[bit].code] = (mask & (1 << bit)) ? 1 : -1;
    }
    const val = objective(cfg);
    if (val < bestObj) {
      bestObj = val;
      bestCfg = cfg;
    }
  }

  // Fine coordinate refinement in [-1, 1] for numeric factors (categorical text factors stay discrete ±1)
  for (let pass = 0; pass < 5; pass++) {
    let improved = false;
    for (const f of active) {
      let localBest = bestCfg[f.code];
      let localObj = bestObj;
      const candidates =
        f.type === 'text'
          ? [-1, 1]
          : Array.from({ length: 41 }, (_, s) => -1 + (2 * s) / 40);
      for (const cand of candidates) {
        const testCfg = { ...bestCfg, [f.code]: cand };
        const val = objective(testCfg);
        if (val < localObj - 1e-12) {
          localObj = val;
          localBest = cand;
        }
      }
      if (localBest !== bestCfg[f.code]) {
        bestCfg = { ...bestCfg, [f.code]: localBest };
        bestObj = localObj;
        improved = true;
      }
    }
    if (!improved) break;
  }

  const actualSettings: Record<string, number> = {};
  for (const f of active) {
    actualSettings[f.code] =
      f.type === 'text'
        ? bestCfg[f.code] >= 0
          ? 1
          : -1
        : codedToActual(bestCfg[f.code], f.low, f.high);
  }

  return {
    goal,
    targetValue,
    codedSettings: bestCfg,
    actualSettings,
    predictedY: predictDoeCoded(analysis, bestCfg),
  };
}
