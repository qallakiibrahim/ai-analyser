import { ProductionRow } from './stats';
import { studentTTwoTailedP, fDistUpperTailP } from './advancedStats';

export interface RegressionTermSpec {
  id: string;
  factor: string;
  degree: 1 | 2;
  label: string;
}

export interface RegressionCoefficient {
  id: string;
  term: string;
  factor: string | null; // null for intercept
  degree: 0 | 1 | 2;
  estimate: number;
  stdError: number;
  tStat: number;
  pValue: number;
  ciLow: number;
  ciHigh: number;
  standardizedBeta: number | null;
  vif: number | null;
  isSignificant: boolean;
}

export interface RegressionPredictionPoint {
  rowIndex: number;
  label: string;
  actual: number;
  predicted: number;
  residual: number;
  stdResidual: number;
}

export interface FactorRange {
  factor: string;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
}

export interface MultipleRegressionResult {
  target: string;
  factors: string[];
  terms: RegressionTermSpec[];
  n: number;
  dfModel: number;
  dfError: number;
  rSquared: number;
  adjRSquared: number;
  rmse: number;
  mae: number;
  aicc: number;
  fStat: number;
  modelPValue: number;
  durbinWatson: number | null;
  tCritical05: number;
  coefficients: RegressionCoefficient[];
  equationText: string;
  points: RegressionPredictionPoint[];
  factorRanges: Record<string, FactorRange>;
  xtxInv: number[][];
  collinearWarning: boolean;
  summaryVerdict: string;
}

export interface OptimalModelRecommendation {
  selectedFactors: string[];
  selectedTerms: RegressionTermSpec[];
  result: MultipleRegressionResult;
  droppedFactors: string[];
  candidateCount: number;
  explanation: string;
}

export type OptimizationGoal = 'target' | 'minimize' | 'maximize';

export interface OptimizationSolution {
  goal: OptimizationGoal;
  targetValue: number;
  settings: Record<string, number>;
  predictedY: number;
  predIntervalLow: number;
  predIntervalHigh: number;
}

/**
 * Inverse Student-t critical value for two-tailed alpha = 0.05 (95% CI / significance threshold).
 * Uses binary search over exact studentTTwoTailedP for df >= 1.
 */
export function studentTCritical05(df: number): number {
  if (df <= 0 || !Number.isFinite(df)) return 1.96;
  if (df > 500) return 1.96;
  let lo = 1.9;
  let hi = df === 1 ? 15 : 8;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    const p = studentTTwoTailedP(mid, df);
    if (p > 0.05) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Gauss-Jordan matrix inversion with partial pivoting.
 * Returns null if matrix is singular or near-singular.
 */
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
      const absVal = Math.abs(aug[r][col]);
      if (absVal > maxAbs) {
        maxAbs = absVal;
        pivotRow = r;
      }
    }

    if (maxAbs < 1e-12) {
      return null;
    }

    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }

    const pivotVal = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivotVal;
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = 0; j < 2 * n; j++) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

function buildDesignRow(
  values: Record<string, number>,
  terms: RegressionTermSpec[],
  means: Record<string, number>
): number[] {
  const row: number[] = [1];
  for (const term of terms) {
    const v = values[term.factor];
    if (term.degree === 1) {
      row.push(v);
    } else {
      // Center quadratic term around factor mean for numerical stability & low collinearity
      const centered = v - (means[term.factor] ?? 0);
      row.push(centered * centered);
    }
  }
  return row;
}

export function buildLinearTerms(factors: string[]): RegressionTermSpec[] {
  return factors.map((f) => ({
    id: `${f}::1`,
    factor: f,
    degree: 1,
    label: f,
  }));
}

export function buildTermsWithQuadratics(
  factors: string[],
  quadraticFactors: string[]
): RegressionTermSpec[] {
  const terms: RegressionTermSpec[] = buildLinearTerms(factors);
  for (const qf of quadraticFactors) {
    if (factors.includes(qf)) {
      terms.push({
        id: `${qf}::2`,
        factor: qf,
        degree: 2,
        label: `(${qf} − μ)²`,
      });
    }
  }
  return terms;
}

/**
 * Computes VIF for each predictor column in the design matrix (excluding intercept).
 */
function computeVifs(X: number[][], numTerms: number): (number | null)[] {
  if (numTerms <= 1) {
    return Array.from({ length: numTerms }, () => 1);
  }
  const n = X.length;
  // Standardize columns 1..numTerms and invert their correlation matrix -> diagonal entries are exact VIFs!
  const cols: number[][] = [];
  for (let j = 1; j <= numTerms; j++) {
    const vals = X.map((row) => row[j]);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, n - 1));
    if (sd < 1e-12) return Array.from({ length: numTerms }, () => null);
    cols.push(vals.map((v) => (v - mean) / sd));
  }

  const corr: number[][] = Array.from({ length: numTerms }, () => Array(numTerms).fill(0));
  for (let i = 0; i < numTerms; i++) {
    corr[i][i] = 1;
    for (let j = i + 1; j < numTerms; j++) {
      let sum = 0;
      for (let r = 0; r < n; r++) sum += cols[i][r] * cols[j][r];
      const val = sum / Math.max(1, n - 1);
      corr[i][j] = val;
      corr[j][i] = val;
    }
  }

  const inv = invertMatrix(corr);
  if (!inv) {
    return Array.from({ length: numTerms }, () => null);
  }
  return inv.map((row, idx) => (Number.isFinite(row[idx]) && row[idx] >= 1 ? row[idx] : 1));
}

export function fitMultipleRegression(
  rows: ProductionRow[],
  target: string,
  terms: RegressionTermSpec[]
): MultipleRegressionResult | null {
  const uniqueFactors = Array.from(new Set(terms.map((t) => t.factor)));
  if (uniqueFactors.length === 0 || terms.length === 0) return null;

  // Filter rows having finite target and all required factor values
  const validRows = rows.filter((r) => {
    const y = r.values[target];
    if (typeof y !== 'number' || !Number.isFinite(y)) return false;
    return uniqueFactors.every(
      (f) => typeof r.values[f] === 'number' && Number.isFinite(r.values[f])
    );
  });

  const n = validRows.length;
  const p = terms.length + 1; // including intercept
  if (n <= p + 1) return null;

  // Compute factor ranges & means
  const factorRanges: Record<string, FactorRange> = {};
  const factorMeans: Record<string, number> = {};
  for (const f of uniqueFactors) {
    const vals = validRows.map((r) => r.values[f]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1));
    factorRanges[f] = { factor: f, min, max, mean, stdDev: sd };
    factorMeans[f] = mean;
  }

  const yVals = validRows.map((r) => r.values[target]);
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  const sdY = Math.sqrt(yVals.reduce((s, v) => s + (v - meanY) * (v - meanY), 0) / (n - 1));

  // Build design matrix X (n x p)
  const X: number[][] = validRows.map((r) => buildDesignRow(r.values, terms, factorMeans));

  // Compute X^T X and X^T y
  const xtx: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const xty: number[] = Array(p).fill(0);

  for (let i = 0; i < n; i++) {
    const xi = X[i];
    const yi = yVals[i];
    for (let j = 0; j < p; j++) {
      xty[j] += xi[j] * yi;
      for (let k = j; k < p; k++) {
        xtx[j][k] += xi[j] * xi[k];
      }
    }
  }
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < j; k++) {
      xtx[j][k] = xtx[k][j];
    }
  }

  let collinearWarning = false;
  let xtxInv = invertMatrix(xtx);
  if (!xtxInv) {
    // Tiny ridge fallback for exact collinearity so UI stays responsive with a clear warning
    collinearWarning = true;
    const ridge = xtx.map((row, i) => row.map((v, j) => (i === j ? v + 1e-6 : v)));
    xtxInv = invertMatrix(ridge);
    if (!xtxInv) return null;
  }

  // beta = (X^T X)^-1 X^T y
  const beta: number[] = Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (let k = 0; k < p; k++) sum += xtxInv[j][k] * xty[k];
    beta[j] = sum;
  }

  // Predictions, residuals, SS
  let ssRes = 0;
  let ssTot = 0;
  let absErrSum = 0;
  const rawPredicted: number[] = [];
  const rawResiduals: number[] = [];

  for (let i = 0; i < n; i++) {
    let yHat = 0;
    for (let j = 0; j < p; j++) yHat += X[i][j] * beta[j];
    const res = yVals[i] - yHat;
    rawPredicted.push(yHat);
    rawResiduals.push(res);
    ssRes += res * res;
    ssTot += (yVals[i] - meanY) * (yVals[i] - meanY);
    absErrSum += Math.abs(res);
  }

  const dfModel = terms.length;
  const dfError = n - p;
  const mse = ssRes / Math.max(1, dfError);
  const rmse = Math.sqrt(mse);
  const mae = absErrSum / n;

  const rSquared = ssTot > 1e-15 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
  const adjRSquared =
    dfError > 0 && ssTot > 1e-15
      ? 1 - ((1 - rSquared) * (n - 1)) / dfError
      : rSquared;

  const msModel = (ssTot - ssRes) / Math.max(1, dfModel);
  let fStat = 0;
  let modelPValue = 1;
  if (mse > 1e-24) {
    fStat = Math.max(0, msModel / mse);
    modelPValue = fStat > 0 ? fDistUpperTailP(fStat, dfModel, dfError) : 1;
  } else if (msModel > 1e-12) {
    // Exact noiseless fit (R² = 1)
    fStat = 999999;
    modelPValue = 0;
  }

  // Corrected AIC (AICc) for parsimonious model comparison
  const kParams = p + 1; // coefficients + error variance
  const logLikTerm = n * Math.log(Math.max(1e-15, ssRes / n));
  const aic = logLikTerm + 2 * kParams;
  const aicc = n - kParams - 1 > 0 ? aic + (2 * kParams * (kParams + 1)) / (n - kParams - 1) : aic;

  // Durbin-Watson statistic for residual autocorrelation
  let dwNum = 0;
  for (let i = 1; i < n; i++) {
    const diff = rawResiduals[i] - rawResiduals[i - 1];
    dwNum += diff * diff;
  }
  const durbinWatson = ssRes > 1e-15 ? dwNum / ssRes : null;

  const tCritical05 = studentTCritical05(dfError);
  const vifs = computeVifs(X, terms.length);
  if (vifs.some((v) => v !== null && v > 5)) {
    collinearWarning = true;
  }

  // Standard deviations of X columns for standardized beta
  const xColSds: number[] = [0];
  for (let j = 1; j < p; j++) {
    const vals = X.map((row) => row[j]);
    const m = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) * (v - m), 0) / (n - 1));
    xColSds.push(sd);
  }

  const coefficients: RegressionCoefficient[] = [];
  for (let j = 0; j < p; j++) {
    const se = Math.sqrt(Math.max(0, mse * xtxInv[j][j]));
    let tStat = 0;
    let pValue = 1;
    if (se > 1e-18) {
      tStat = beta[j] / se;
      pValue = studentTTwoTailedP(tStat, dfError);
    } else if (Math.abs(beta[j]) > 1e-10) {
      tStat = beta[j] >= 0 ? 999 : -999;
      pValue = 0;
    }
    const ciLow = beta[j] - tCritical05 * se;
    const ciHigh = beta[j] + tCritical05 * se;

    if (j === 0) {
      coefficients.push({
        id: 'intercept',
        term: 'Konstant (β₀)',
        factor: null,
        degree: 0,
        estimate: beta[0],
        stdError: se,
        tStat,
        pValue,
        ciLow,
        ciHigh,
        standardizedBeta: null,
        vif: null,
        isSignificant: pValue < 0.05,
      });
    } else {
      const spec = terms[j - 1];
      const stdBeta = sdY > 1e-15 ? (beta[j] * xColSds[j]) / sdY : 0;
      coefficients.push({
        id: spec.id,
        term: spec.label,
        factor: spec.factor,
        degree: spec.degree,
        estimate: beta[j],
        stdError: se,
        tStat,
        pValue,
        ciLow,
        ciHigh,
        standardizedBeta: stdBeta,
        vif: vifs[j - 1],
        isSignificant: pValue < 0.05,
      });
    }
  }

  // Human-readable Swedish equation
  const eqParts: string[] = [`${target} = ${beta[0].toFixed(4)}`];
  for (let j = 1; j < p; j++) {
    const coef = beta[j];
    const sign = coef >= 0 ? ' + ' : ' − ';
    const spec = terms[j - 1];
    const termName =
      spec.degree === 1
        ? spec.factor
        : `(${spec.factor} − ${factorMeans[spec.factor].toFixed(2)})²`;
    eqParts.push(`${sign}${Math.abs(coef).toFixed(4)} · ${termName}`);
  }
  const equationText = eqParts.join('');

  // Build prediction & residual points (capped smoothly at 300 points for SVG speed)
  const step = n > 300 ? Math.ceil(n / 300) : 1;
  const points: RegressionPredictionPoint[] = [];
  for (let i = 0; i < n; i++) {
    if (i % step === 0 || i === n - 1) {
      points.push({
        rowIndex: validRows[i].rowIndex,
        label: validRows[i].label,
        actual: Number(yVals[i].toFixed(4)),
        predicted: Number(rawPredicted[i].toFixed(4)),
        residual: Number(rawResiduals[i].toFixed(4)),
        stdResidual: rmse > 1e-12 ? Number((rawResiduals[i] / rmse).toFixed(3)) : 0,
      });
    }
  }

  const sigTerms = coefficients.filter((c) => c.degree > 0 && c.isSignificant);
  const strengthText =
    adjRSquared >= 0.7
      ? 'Stark förklaringsgrad'
      : adjRSquared >= 0.4
      ? 'Måttlig förklaringsgrad'
      : adjRSquared >= 0.15
      ? 'Svag till måttlig förklaringsgrad'
      : 'Mycket svag förklaringsgrad';

  const summaryVerdict =
    modelPValue < 0.05
      ? `${strengthText}: modellen förklarar ${(rSquared * 100).toFixed(1)} % (justerat ${(adjRSquared * 100).toFixed(1)} %) av variationen i ${target} (F = ${fStat.toFixed(2)}, p = ${modelPValue < 0.0001 ? '< 0.0001' : modelPValue.toFixed(4)}). ${
          sigTerms.length > 0
            ? `Tydligast drivande faktor: ${sigTerms.sort((a, b) => Math.abs(b.tStat) - Math.abs(a.tStat))[0].term}.`
            : ''
        }`
      : `Modellen är inte statistiskt signifikant (p = ${modelPValue.toFixed(4)}). Valda X-faktorer förklarar inte variationen i ${target} bättre än slump.`;

  return {
    target,
    factors: uniqueFactors,
    terms,
    n,
    dfModel,
    dfError,
    rSquared,
    adjRSquared,
    rmse,
    mae,
    aicc,
    fStat,
    modelPValue,
    durbinWatson,
    tCritical05,
    coefficients,
    equationText,
    points,
    factorRanges,
    xtxInv,
    collinearWarning,
    summaryVerdict,
  };
}

/**
 * Automatically searches for the optimal parsimonious regression model (lowest AICc / highest Adj R²)
 * across all candidate X factors (and optional quadratic curvature terms).
 */
export function findOptimalModel(
  rows: ProductionRow[],
  target: string,
  candidateFactors: string[],
  allowCurvature: boolean = false
): OptimalModelRecommendation | null {
  const usable = candidateFactors.filter((f) => f !== target);
  if (usable.length === 0) return null;

  let bestResult: MultipleRegressionResult | null = null;
  let bestScore = Infinity; // minimize AICc with penalty for insignificant noise terms
  let evaluated = 0;

  const evaluateTerms = (terms: RegressionTermSpec[]) => {
    const fit = fitMultipleRegression(rows, target, terms);
    if (!fit) return;
    evaluated++;
    const nonSigCount = fit.coefficients.filter((c) => c.degree > 0 && !c.isSignificant).length;
    // Parsimony score: AICc + mild penalty for each non-significant term (favors clean, interpretable models)
    const score = fit.aicc + nonSigCount * 2.2;
    if (score < bestScore) {
      bestScore = score;
      bestResult = fit;
    }
  };

  if (usable.length <= 8) {
    // Exact best-subset search over all 2^k - 1 non-empty subsets
    const totalSubsets = 1 << usable.length;
    for (let mask = 1; mask < totalSubsets; mask++) {
      const subset: string[] = [];
      for (let bit = 0; bit < usable.length; bit++) {
        if ((mask & (1 << bit)) !== 0) subset.push(usable[bit]);
      }
      evaluateTerms(buildLinearTerms(subset));
    }
  } else {
    // Forward stepwise selection for wide tables (>8 factors)
    const selected: string[] = [];
    const remaining = [...usable];
    while (remaining.length > 0 && selected.length < 8) {
      let stepBestFactor: string | null = null;
      let stepBestScore = bestScore;
      for (const cand of remaining) {
        const terms = buildLinearTerms([...selected, cand]);
        const fit = fitMultipleRegression(rows, target, terms);
        if (!fit) continue;
        evaluated++;
        const nonSigCount = fit.coefficients.filter((c) => c.degree > 0 && !c.isSignificant).length;
        const score = fit.aicc + nonSigCount * 2.2;
        if (score < stepBestScore) {
          stepBestScore = score;
          stepBestFactor = cand;
          bestScore = score;
          bestResult = fit;
        }
      }
      if (!stepBestFactor) break;
      selected.push(stepBestFactor);
      remaining.splice(remaining.indexOf(stepBestFactor), 1);
    }
  }

  // Optionally test adding quadratic curvature X² for winning linear factors
  if (allowCurvature && bestResult) {
    const winningFactors = (bestResult as MultipleRegressionResult).factors;
    for (const f of winningFactors) {
      const quadTerms = buildTermsWithQuadratics(winningFactors, [f]);
      const quadFit = fitMultipleRegression(rows, target, quadTerms);
      if (quadFit) {
        evaluated++;
        const quadCoef = quadFit.coefficients.find((c) => c.factor === f && c.degree === 2);
        if (quadCoef && quadCoef.isSignificant && quadFit.aicc < bestScore - 1.5) {
          bestScore = quadFit.aicc;
          bestResult = quadFit;
        }
      }
    }
  }

  if (!bestResult) return null;

  const finalFit = bestResult as MultipleRegressionResult;
  const droppedFactors = usable.filter((f) => !finalFit.factors.includes(f));
  const hasQuad = finalFit.terms.some((t) => t.degree === 2);

  const explanation =
    droppedFactors.length > 0
      ? `Autopiloten testade ${evaluated} modellkombinationer och valde ${finalFit.factors.join(
          ' + '
        )}${hasQuad ? ' (inkl. kurvatur X²)' : ''} som ger bäst balans mellan precision (justerat R² = ${(
          finalFit.adjRSquared * 100
        ).toFixed(1)} %) och enkelhet. Bortvalda brusfaktorer: ${droppedFactors.join(', ')}.`
      : `Autopiloten testade ${evaluated} modellkombinationer och behöll samtliga ${finalFit.factors.length} faktorer (${finalFit.factors.join(
          ' + '
        )}${hasQuad ? ' inkl. kurvatur X²' : ''}) med justerat R² = ${(
          finalFit.adjRSquared * 100
        ).toFixed(1)} %.`;

  return {
    selectedFactors: finalFit.factors,
    selectedTerms: finalFit.terms,
    result: finalFit,
    droppedFactors,
    candidateCount: evaluated,
    explanation,
  };
}

/**
 * Evaluates predicted Y and 95% prediction interval for arbitrary factor settings.
 */
export function predictWithInterval(
  model: MultipleRegressionResult,
  settings: Record<string, number>
): { predictedY: number; low: number; high: number } {
  const means: Record<string, number> = {};
  for (const f of model.factors) {
    means[f] = model.factorRanges[f]?.mean ?? 0;
  }

  const x0 = buildDesignRow(settings, model.terms, means);
  let yHat = 0;
  for (let j = 0; j < x0.length; j++) {
    yHat += x0[j] * model.coefficients[j].estimate;
  }

  // Prediction variance: MSE * (1 + x0^T (X^T X)^-1 x0)
  let leverage = 0;
  for (let j = 0; j < x0.length; j++) {
    for (let k = 0; k < x0.length; k++) {
      leverage += x0[j] * model.xtxInv[j][k] * x0[k];
    }
  }
  const predSe = model.rmse * Math.sqrt(Math.max(1, 1 + leverage));
  const halfWidth = model.tCritical05 * predSe;

  return {
    predictedY: yHat,
    low: yHat - halfWidth,
    high: yHat + halfWidth,
  };
}

/**
 * Response Optimizer: finds optimal realistic settings within each factor's observed [min, max]
 * to hit Target, Minimize Y, or Maximize Y.
 */
export function optimizeResponse(
  model: MultipleRegressionResult,
  goal: OptimizationGoal,
  targetValue: number
): OptimizationSolution {
  // Start from factor means
  const best: Record<string, number> = {};
  for (const f of model.factors) {
    best[f] = model.factorRanges[f].mean;
  }

  const objective = (cfg: Record<string, number>): number => {
    const { predictedY } = predictWithInterval(model, cfg);
    if (goal === 'minimize') return predictedY;
    if (goal === 'maximize') return -predictedY;
    return Math.abs(predictedY - targetValue);
  };

  let bestObj = objective(best);

  // Coordinate descent with 40 grid steps per factor over 6 refinement passes (fast & exact for linear/quadratic)
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (const f of model.factors) {
      const range = model.factorRanges[f];
      const steps = 40;
      let localBestX = best[f];
      let localBestObj = bestObj;

      for (let s = 0; s <= steps; s++) {
        const candidateX = range.min + ((range.max - range.min) * s) / steps;
        const testCfg = { ...best, [f]: candidateX };
        const val = objective(testCfg);
        if (val < localBestObj - 1e-12) {
          localBestObj = val;
          localBestX = candidateX;
        }
      }

      if (localBestX !== best[f]) {
        best[f] = localBestX;
        bestObj = localBestObj;
        improved = true;
      }
    }
    if (!improved) break;
  }

  // Round cleanly for display
  const roundedSettings: Record<string, number> = {};
  for (const f of model.factors) {
    const span = model.factorRanges[f].max - model.factorRanges[f].min;
    const dec = span < 1 ? 4 : span < 20 ? 3 : span < 200 ? 2 : 1;
    roundedSettings[f] = Number(best[f].toFixed(dec));
  }

  const pred = predictWithInterval(model, roundedSettings);
  return {
    goal,
    targetValue,
    settings: roundedSettings,
    predictedY: pred.predictedY,
    predIntervalLow: pred.low,
    predIntervalHigh: pred.high,
  };
}
