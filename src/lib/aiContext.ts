import {
  ExcludedPoint,
  ProcessDiagnosis,
  ProductionRow,
  SpecLimits,
} from './stats';
import {
  ColumnTriageItem,
  CorrelationFinding,
  NonNormalCapability,
  analyzeGroups,
} from './advancedStats';
import { StagingMode, detectAutomaticStageSplits } from './staging';
import {
  MultipleRegressionResult,
  compareFittedLineModels,
  findOptimalModel,
} from './regression';
import {
  DoeAnalysisResult,
  DoeDesignType,
  DoeFactor,
  DoeOptimizationResult,
  formatFactorLevel,
  getDesignLabel,
} from './doe';

export interface AiScopeOptions {
  includeAutopilot: boolean;
  includeStagesAndExclusions: boolean;
  includeRegression: boolean;
  includeDoe: boolean;
}

export interface StageContextSnapshot {
  mode: StagingMode;
  autoNote: string | null;
  splitRows: number[];
  stages: Array<{
    stageIndex: number;
    label: string;
    startRow: number;
    endRow: number;
    count: number;
    mean: number;
    stdDev: number;
    cpk: number | null;
    ppk: number | null;
    mrBar: number;
    oosCount: number;
  }>;
}

export interface FittedLineContextSnapshot {
  factor: string;
  recommendedDegree: number;
  degreeLabel: string;
  rSquared: number;
  adjRSquared: number;
  rmse: number;
  aicc: number;
  equationText: string;
  recommendationReason: string;
}

export interface RegressionContextSnapshot {
  target: string;
  n: number;
  selectedFactors: string[];
  rSquared: number;
  adjRSquared: number;
  rmse: number;
  modelPValue: number;
  durbinWatson: number | null;
  collinearWarning: boolean;
  equationText: string;
  summaryVerdict: string;
  topTerms: Array<{
    term: string;
    estimate: number;
    tStat: number;
    pValue: number;
    vif: number | null;
    isSignificant: boolean;
  }>;
  fittedLine: FittedLineContextSnapshot | null;
}

export interface DoeContextSnapshot {
  experimentName: string;
  design: DoeDesignType;
  designLabel: string;
  responseName: string;
  responseUnit: string;
  nCompleted: number;
  nTotal: number;
  isModifiedByUser: boolean;
  rSquared: number;
  adjRSquared: number;
  modelPValue: number | null;
  inferenceMethod: string;
  actualEquation: string;
  summaryVerdict: string;
  aliasSummary: string | null;
  curvature: {
    hasCenterPoints: boolean;
    isSignificant: boolean;
    pValue: number | null;
    message: string;
  };
  topEffects: Array<{
    code: string;
    label: string;
    effect: number;
    pValue: number | null;
    isSignificant: boolean;
    isInteraction: boolean;
    aliasNote: string | null;
  }>;
  optimization: {
    goal: string;
    targetValue: number;
    predictedY: number;
    settings: Record<string, string>;
  } | null;
}

export interface ExtendedAnalysisContext {
  includedModules: string[];
  exclusions?: {
    totalExcluded: number;
    items: Array<{
      rowIndex: number;
      label: string;
      value: number;
      reason: string;
    }>;
  };
  stages?: {
    activeMode: StagingMode;
    autoNote: string | null;
    autoDetectedSplitRows: number[];
    stages: StageContextSnapshot['stages'];
  };
  autopilot?: {
    diagnosisTitle: string;
    diagnosisSummary: string;
    nonNormalCapability: {
      methodName: string;
      pp: number | null;
      ppk: number | null;
      p0135: number;
      median: number;
      p99865: number;
    };
    topCorrelations: Array<{
      predictor: string;
      r: number;
      rSquared: number;
      pValue: number;
      isSignificant: boolean;
      strength: string;
      direction: string;
    }>;
    batchTriage: Array<{
      column: string;
      status: string;
      effectivePpk: number | null;
      cpk: number | null;
      oosCount: number;
      anomalyCount: number;
      recommendedMethod: string;
    }>;
    groupAnova: Array<{
      categoryColumn: string;
      fStat: number | null;
      pValue: number | null;
      etaSquared: number | null;
      isSignificant: boolean;
      verdict: string;
      groups: Array<{
        group: string;
        count: number;
        mean: number;
        cpk: number | null;
        oosCount: number;
      }>;
    }>;
  };
  regression?: RegressionContextSnapshot;
  doe?: DoeContextSnapshot;
}

function roundNum(val: number | null | undefined, digits = 4): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  return Number(val.toFixed(digits));
}

export function buildRegressionSnapshotFromModel(
  model: MultipleRegressionResult | null,
  rows: ProductionRow[],
  targetMetric: string,
  preferredFittedFactor?: string
): RegressionContextSnapshot | null {
  if (!model) return null;

  const fittedFactor =
    preferredFittedFactor ||
    model.coefficients
      .filter((c) => c.degree === 1 && c.factor)
      .sort((a, b) => Math.abs(b.tStat) - Math.abs(a.tStat))[0]?.factor ||
    model.factors[0];

  let fittedLine: FittedLineContextSnapshot | null = null;
  if (fittedFactor) {
    const cmp = compareFittedLineModels(rows, targetMetric, fittedFactor);
    const best = cmp?.models[cmp.recommendedDegree] || null;
    if (cmp && best) {
      fittedLine = {
        factor: fittedFactor,
        recommendedDegree: cmp.recommendedDegree,
        degreeLabel: best.degreeLabel,
        rSquared: Number(best.rSquared.toFixed(4)),
        adjRSquared: Number(best.adjRSquared.toFixed(4)),
        rmse: Number(best.rmse.toFixed(4)),
        aicc: Number(best.aicc.toFixed(2)),
        equationText: best.equationText,
        recommendationReason: cmp.recommendationReason,
      };
    }
  }

  const topTerms = model.coefficients
    .filter((c) => c.degree > 0)
    .sort((a, b) => Math.abs(b.tStat) - Math.abs(a.tStat))
    .slice(0, 8)
    .map((c) => ({
      term: c.term,
      estimate: Number(c.estimate.toFixed(5)),
      tStat: Number(c.tStat.toFixed(3)),
      pValue: Number(c.pValue.toFixed(5)),
      vif: roundNum(c.vif, 2),
      isSignificant: c.isSignificant,
    }));

  return {
    target: model.target,
    n: model.n,
    selectedFactors: model.factors,
    rSquared: Number(model.rSquared.toFixed(4)),
    adjRSquared: Number(model.adjRSquared.toFixed(4)),
    rmse: Number(model.rmse.toFixed(4)),
    modelPValue: Number(model.modelPValue.toFixed(5)),
    durbinWatson: roundNum(model.durbinWatson, 3),
    collinearWarning: model.collinearWarning,
    equationText: model.equationText,
    summaryVerdict: model.summaryVerdict,
    topTerms,
    fittedLine,
  };
}

export function buildAutoRegressionSnapshot(
  rows: ProductionRow[],
  targetMetric: string,
  allColumns: string[],
  correlations: CorrelationFinding[]
): RegressionContextSnapshot | null {
  const candidates = allColumns.filter((c) => c !== targetMetric);
  if (candidates.length === 0 || rows.length < 6) return null;

  const rec = findOptimalModel(rows, targetMetric, candidates, false);
  const bestX = correlations[0]?.predictor || candidates[0];
  return buildRegressionSnapshotFromModel(rec?.result || null, rows, targetMetric, bestX);
}

export function buildDoeSnapshot(
  experimentName: string,
  design: DoeDesignType,
  responseName: string,
  responseUnit: string,
  factors: DoeFactor[],
  analysis: DoeAnalysisResult | null,
  optimization: DoeOptimizationResult | null,
  isModifiedByUser: boolean
): DoeContextSnapshot | null {
  if (!analysis || analysis.nCompleted < 3) return null;

  let optSnap: DoeContextSnapshot['optimization'] = null;
  if (optimization) {
    const settings: Record<string, string> = {};
    for (const f of factors) {
      const coded = optimization.codedSettings[f.code];
      if (typeof coded === 'number' && Number.isFinite(coded)) {
        settings[`${f.code} (${f.name})`] = formatFactorLevel(f, coded);
      }
    }
    optSnap = {
      goal: optimization.goal,
      targetValue: optimization.targetValue,
      predictedY: Number(optimization.predictedY.toFixed(4)),
      settings,
    };
  }

  return {
    experimentName,
    design,
    designLabel: getDesignLabel(design),
    responseName,
    responseUnit,
    nCompleted: analysis.nCompleted,
    nTotal: analysis.nTotal,
    isModifiedByUser,
    rSquared: Number(analysis.rSquared.toFixed(4)),
    adjRSquared: Number(analysis.adjRSquared.toFixed(4)),
    modelPValue: roundNum(analysis.modelPValue, 5),
    inferenceMethod: analysis.inferenceMethod,
    actualEquation: analysis.actualEquation,
    summaryVerdict: analysis.summaryVerdict,
    aliasSummary: analysis.aliasSummary,
    curvature: {
      hasCenterPoints: analysis.curvature.hasCenterPoints,
      isSignificant: analysis.curvature.isSignificant,
      pValue: roundNum(analysis.curvature.pValue, 5),
      message: analysis.curvature.message,
    },
    topEffects: analysis.effects.slice(0, 10).map((e) => ({
      code: e.code,
      label: e.label,
      effect: Number(e.effect.toFixed(4)),
      pValue: roundNum(e.pValue, 5),
      isSignificant: e.isSignificant,
      isInteraction: e.isInteraction,
      aliasNote: e.aliasNote,
    })),
    optimization: optSnap,
  };
}

export function buildExtendedAnalysisContext(params: {
  scope: AiScopeOptions;
  allRows: ProductionRow[];
  activeRows: ProductionRow[];
  columns: string[];
  categoryColumns: string[];
  selectedMetric: string;
  spec: SpecLimits;
  exclusions: Record<number, ExcludedPoint>;
  diagnosis: ProcessDiagnosis;
  nonNormalCap: NonNormalCapability;
  correlations: CorrelationFinding[];
  triageItems: ColumnTriageItem[];
  stageSnapshot: StageContextSnapshot | null;
  regressionSnapshot: RegressionContextSnapshot | null;
  doeSnapshot: DoeContextSnapshot | null;
}): ExtendedAnalysisContext {
  const {
    scope,
    allRows,
    activeRows,
    columns,
    categoryColumns,
    selectedMetric,
    spec,
    exclusions,
    diagnosis,
    nonNormalCap,
    correlations,
    triageItems,
    stageSnapshot,
    regressionSnapshot,
    doeSnapshot,
  } = params;

  const includedModules: string[] = ['Grund-SPC (I-MR, Cp/Cpk, Pp/Ppk, Normalitet, Nelson-regler)'];
  const ctx: ExtendedAnalysisContext = { includedModules };

  if (scope.includeStagesAndExclusions) {
    includedModules.push('Faser (Stages) & Exkluderade Special Cause-punkter');

    const excludedItems = allRows
      .filter((r) => Boolean(exclusions[r.rowIndex]) && typeof r.values[selectedMetric] === 'number')
      .map((r) => ({
        rowIndex: r.rowIndex,
        label: r.label,
        value: Number(r.values[selectedMetric].toFixed(4)),
        reason: exclusions[r.rowIndex].reason,
      }))
      .slice(0, 25);

    ctx.exclusions = {
      totalExcluded: excludedItems.length,
      items: excludedItems,
    };

    const autoDetectedSplitRows = detectAutomaticStageSplits(activeRows, selectedMetric, 4);
    ctx.stages = {
      activeMode: stageSnapshot?.mode || 'none',
      autoNote: stageSnapshot?.autoNote || null,
      autoDetectedSplitRows,
      stages: stageSnapshot?.stages.slice(0, 8) || [],
    };
  }

  if (scope.includeAutopilot) {
    includedModules.push('Autopilot (Icke-normal kapabilitet, Korrelationer, Batch-triage & Kategori-ANOVA)');

    const groupAnova: NonNullable<ExtendedAnalysisContext['autopilot']>['groupAnova'] = [];
    for (const catCol of categoryColumns.slice(0, 4)) {
      const res = analyzeGroups(activeRows, selectedMetric, catCol, spec.usl, spec.lsl);
      if (res) {
        groupAnova.push({
          categoryColumn: res.categoryColumn,
          fStat: roundNum(res.fStat, 3),
          pValue: roundNum(res.pValue, 5),
          etaSquared: roundNum(res.etaSquared, 4),
          isSignificant: res.isSignificant,
          verdict: res.verdict,
          groups: res.groups.slice(0, 8).map((g) => ({
            group: g.group,
            count: g.count,
            mean: Number(g.mean.toFixed(4)),
            cpk: roundNum(g.cpk, 3),
            oosCount: g.oosCount,
          })),
        });
      }
    }

    ctx.autopilot = {
      diagnosisTitle: diagnosis.headline,
      diagnosisSummary: diagnosis.summary,
      nonNormalCapability: {
        methodName: nonNormalCap.methodName,
        pp: roundNum(nonNormalCap.pp, 3),
        ppk: roundNum(nonNormalCap.ppk, 3),
        p0135: Number(nonNormalCap.p0135.toFixed(4)),
        median: Number(nonNormalCap.median.toFixed(4)),
        p99865: Number(nonNormalCap.p99865.toFixed(4)),
      },
      topCorrelations: correlations.slice(0, 6).map((c) => ({
        predictor: c.predictor,
        r: Number(c.r.toFixed(4)),
        rSquared: Number(c.rSquared.toFixed(4)),
        pValue: Number(c.pValue.toFixed(5)),
        isSignificant: c.isSignificant,
        strength: c.strength,
        direction: c.direction,
      })),
      batchTriage: triageItems.slice(0, 8).map((t) => ({
        column: t.column,
        status: t.status,
        effectivePpk: roundNum(t.effectivePpk, 3),
        cpk: roundNum(t.cpk, 3),
        oosCount: t.oosCount,
        anomalyCount: t.anomalyCount,
        recommendedMethod: t.recommendedMethod,
      })),
      groupAnova,
    };
  }

  if (scope.includeRegression) {
    const resolvedReg =
      regressionSnapshot && regressionSnapshot.target === selectedMetric
        ? regressionSnapshot
        : buildAutoRegressionSnapshot(activeRows, selectedMetric, columns, correlations);

    if (resolvedReg) {
      includedModules.push('Multipel Regression & Fitted Line Plot');
      ctx.regression = resolvedReg;
    }
  }

  if (scope.includeDoe && doeSnapshot) {
    includedModules.push('DOE (Försöksplanering & Optimering)');
    ctx.doe = doeSnapshot;
  }

  return ctx;
}
