import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  Brain,
  Printer,
  Bookmark,
  Trash2,
  Check,
  X,
  MoreHorizontal,
  Download,
} from 'lucide-react';
import {
  ExcludedPoint,
  ProductionRow,
  SpecLimits,
  SAMPLE_DATASET_SPECS,
  buildChartSeries,
  buildProcessDiagnosis,
  calculateHistogram,
  calculateRollingCapability,
  calculateStats,
  detectAnomalies,
  extractMetricValues,
  generateSampleDataset,
  suggestSpecLimits,
} from '@/src/lib/stats';
import {
  calculateNonNormalCapability,
  calculateQQPlot,
  runBatchTriage,
  scanCorrelations,
} from '@/src/lib/advancedStats';
import {
  ArticlePreset,
  loadArticlePresets,
  saveArticlePresets,
} from '@/src/lib/presets';
import { downloadExcelTemplate } from '@/src/lib/export';
import {
  auth,
  signInWithGoogle,
  logout,
  fetchUserReports,
  saveUserReport,
  deleteUserReport,
  SavedReport,
} from '@/src/lib/firebase';
import {
  AiScopeOptions,
  DoeContextSnapshot,
  RegressionContextSnapshot,
  StageContextSnapshot,
  buildExtendedAnalysisContext,
} from '@/src/lib/aiContext';
import { TopBar, ActiveTab } from '@/src/components/TopBar';
import { KpiOverview } from '@/src/components/KpiOverview';
import { ControlCharts } from '@/src/components/ControlCharts';
import { DistributionAndTrend } from '@/src/components/DistributionAndTrend';
import { AutopilotView } from '@/src/components/AutopilotView';
import { RegressionView } from '@/src/components/RegressionView';
import { DoeView } from '@/src/components/DoeView';
import { SixpackPrintModal } from '@/src/components/SixpackPrintModal';
import { DataTableView } from '@/src/components/DataTableView';
import { AiAnalysisView } from '@/src/components/AiAnalysisView';
import { HistoryView } from '@/src/components/HistoryView';
import { ImportWizard } from '@/src/components/ImportWizard';
import { ExcludePointModal, PointToExclude } from '@/src/components/ExcludePointModal';
import { CsvExportModal } from '@/src/components/CsvExportModal';
import { SopModal } from '@/src/components/SopModal';
import { Toast, ToastMessage } from '@/src/components/Toast';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';

export default function App() {
  const initialSample = useMemo(() => generateSampleDataset(60), []);

  // Dataset & Column State
  const [rows, setRows] = useState<ProductionRow[]>(initialSample.rows);
  const [columns, setColumns] = useState<string[]>(initialSample.columns);
  const [categoryColumns, setCategoryColumns] = useState<string[]>(initialSample.categoryColumns);
  const [datasetName, setDatasetName] = useState<string>(initialSample.datasetName);
  const [selectedMetric, setSelectedMetric] = useState<string>(initialSample.columns[0]);

  // Spec limits stored per column so switching columns preserves each column's tolerances
  const [specsByColumn, setSpecsByColumn] = useState<Record<string, SpecLimits>>(() => {
    const init: Record<string, SpecLimits> = {};
    for (const col of initialSample.columns) {
      const preset = SAMPLE_DATASET_SPECS[col];
      init[col] = {
        usl: preset?.usl ?? 11.5,
        lsl: preset?.lsl ?? 8.5,
        target: preset?.target ?? 10.0,
        uslLabel: 'USL',
        lslLabel: 'LSL',
      };
    }
    return init;
  });

  // Saved Article / Tolerance Presets (localStorage)
  const [articlePresets, setArticlePresets] = useState<ArticlePreset[]>(() => loadArticlePresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [isSavingPreset, setIsSavingPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');

  // UI & Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [isSopOpen, setIsSopOpen] = useState<boolean>(false);
  const [isSixpackOpen, setIsSixpackOpen] = useState<boolean>(false);
  const [isCsvExportOpen, setIsCsvExportOpen] = useState<boolean>(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState<boolean>(false);
  const [showMovingAverage, setShowMovingAverage] = useState<boolean>(false);
  const [distBins, setDistBins] = useState<number>(12);
  const [rollingWindow, setRollingWindow] = useState<number>(15);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Special Cause excluded points per metric (documented audit trail)
  const [excludedByMetric, setExcludedByMetric] = useState<
    Record<string, Record<number, ExcludedPoint>>
  >({});
  const [pointToExclude, setPointToExclude] = useState<PointToExclude | null>(null);

  // Secondary demo simulation toggle
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI & Cloud History State
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [stageSnapshot, setStageSnapshot] = useState<StageContextSnapshot | null>(null);
  const [regressionSnapshot, setRegressionSnapshot] = useState<RegressionContextSnapshot | null>(null);
  const [doeSnapshot, setDoeSnapshot] = useState<DoeContextSnapshot | null>(null);
  const [aiScope, setAiScope] = useState<AiScopeOptions>({
    includeAutopilot: true,
    includeStagesAndExclusions: true,
    includeRegression: true,
    includeDoe: false,
  });

  const handleDoeSnapshotChange = useCallback((snap: DoeContextSnapshot | null) => {
    setDoeSnapshot(snap);
    if (snap?.isModifiedByUser) {
      setAiScope((prev) => (prev.includeDoe ? prev : { ...prev, includeDoe: true }));
    }
  }, []);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setToast({ id: Date.now(), type, text });
  }, []);

  // System dark mode preference on first load
  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Firebase Auth listener
  const loadReports = useCallback(async (uid: string) => {
    setIsLoadingReports(true);
    try {
      const list = await fetchUserReports(uid);
      setReports(list);
    } catch {
      notify('error', 'Kunde inte hämta sparad rapporthistorik.');
    } finally {
      setIsLoadingReports(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        loadReports(u.uid);
      } else {
        setReports([]);
      }
    });
    return () => unsubscribe();
  }, [loadReports]);

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Kunde inte logga in med Google.';
      notify('error', msg);
    }
  }, [notify]);

  // Optional demo simulation stream (only works on the built-in sample dataset columns)
  useEffect(() => {
    if (!isStreaming) {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      return;
    }

    streamIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/demo-point');
        if (!res.ok) return;
        const point = await res.json();
        setRows((prev) => {
          const nextIdx = prev.length > 0 ? prev[prev.length - 1].rowIndex + 1 : 1;
          const date = new Date(point.timestamp);
          const nextRow: ProductionRow = {
            rowIndex: nextIdx,
            timestamp: point.timestamp,
            label: date.toLocaleString('sv-SE', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            values: point.values,
            categories: {
              Skift: 'Skift C',
              Maskin: nextIdx % 2 === 0 ? 'CNC-01' : 'CNC-02',
            },
          };
          return [...prev, nextRow].slice(-200);
        });
      } catch {
        // Ignore transient poll errors in demo mode
      }
    }, 2500);

    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [isStreaming]);

  // Active spec limits for current column
  const activeSpec: SpecLimits = useMemo(() => {
    if (specsByColumn[selectedMetric]) {
      return specsByColumn[selectedMetric];
    }
    const vals = extractMetricValues(rows, selectedMetric);
    const suggested = suggestSpecLimits(vals);
    return {
      ...suggested,
      uslLabel: 'USL',
      lslLabel: 'LSL',
    };
  }, [specsByColumn, selectedMetric, rows]);

  const updateActiveSpec = (patch: Partial<SpecLimits>) => {
    setSpecsByColumn((prev) => ({
      ...prev,
      [selectedMetric]: {
        ...activeSpec,
        ...patch,
      },
    }));
  };

  // Active Special Cause exclusions for selected metric
  const activeExclusions = useMemo(
    () => excludedByMetric[selectedMetric] || {},
    [excludedByMetric, selectedMetric]
  );

  const activeExcludedCount = useMemo(
    () => Object.keys(activeExclusions).length,
    [activeExclusions]
  );

  const activeRows = useMemo(
    () => rows.filter((r) => !activeExclusions[r.rowIndex]),
    [rows, activeExclusions]
  );

  const handleConfirmExclude = useCallback(
    (rowIndex: number, reason: string) => {
      setExcludedByMetric((prev) => ({
        ...prev,
        [selectedMetric]: {
          ...(prev[selectedMetric] || {}),
          [rowIndex]: {
            rowIndex,
            reason,
            excludedAt: new Date().toISOString(),
          },
        },
      }));
      notify('info', `Rad #${rowIndex} exkluderad (Special Cause: ${reason}).`);
    },
    [selectedMetric, notify]
  );

  const handleRestorePoint = useCallback(
    (rowIndex: number) => {
      setExcludedByMetric((prev) => {
        const current = { ...(prev[selectedMetric] || {}) };
        delete current[rowIndex];
        return {
          ...prev,
          [selectedMetric]: current,
        };
      });
      notify('success', `Rad #${rowIndex} återställd i SPC-beräkningen.`);
    },
    [selectedMetric, notify]
  );

  const handleRestoreAllExcluded = useCallback(() => {
    setExcludedByMetric((prev) => ({
      ...prev,
      [selectedMetric]: {},
    }));
    notify('success', `Alla exkluderade punkter för ${selectedMetric} har återställts.`);
  }, [selectedMetric, notify]);

  // Memoized SPC Calculations (on 100% of active non-excluded rows)
  const metricValues = useMemo(
    () => extractMetricValues(activeRows, selectedMetric),
    [activeRows, selectedMetric]
  );

  const stats = useMemo(
    () => calculateStats(metricValues, activeSpec.usl, activeSpec.lsl, activeSpec.target),
    [metricValues, activeSpec.usl, activeSpec.lsl, activeSpec.target]
  );

  const { anomalies, anomaliesByRow } = useMemo(
    () => detectAnomalies(activeRows, selectedMetric, activeSpec.usl, activeSpec.lsl, stats),
    [activeRows, selectedMetric, activeSpec.usl, activeSpec.lsl, stats]
  );

  const chartSeries = useMemo(
    () => buildChartSeries(activeRows, selectedMetric, stats, anomaliesByRow, showMovingAverage),
    [activeRows, selectedMetric, stats, anomaliesByRow, showMovingAverage]
  );

  const histogram = useMemo(
    () => calculateHistogram(metricValues, stats, distBins),
    [metricValues, stats, distBins]
  );

  const rollingHistory = useMemo(
    () =>
      calculateRollingCapability(
        activeRows,
        selectedMetric,
        activeSpec.usl,
        activeSpec.lsl,
        rollingWindow
      ),
    [activeRows, selectedMetric, activeSpec.usl, activeSpec.lsl, rollingWindow]
  );

  const diagnosis = useMemo(
    () => buildProcessDiagnosis(stats, anomalies),
    [stats, anomalies]
  );

  // Autopilot Memoized Calculations
  const nonNormalCap = useMemo(
    () => calculateNonNormalCapability(metricValues, activeSpec.usl, activeSpec.lsl),
    [metricValues, activeSpec.usl, activeSpec.lsl]
  );

  const qqPoints = useMemo(() => calculateQQPlot(metricValues), [metricValues]);

  const triageItems = useMemo(
    () => runBatchTriage(activeRows, columns, specsByColumn),
    [activeRows, columns, specsByColumn]
  );

  const correlations = useMemo(
    () => scanCorrelations(activeRows, selectedMetric, columns),
    [activeRows, selectedMetric, columns]
  );

  // Article Preset Handlers
  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = articlePresets.find((p) => p.id === presetId);
    if (!preset) return;

    let appliedCount = 0;
    const nextSpecs: Record<string, SpecLimits> = { ...specsByColumn };
    for (const col of columns) {
      if (preset.specs[col]) {
        nextSpecs[col] = { ...preset.specs[col] };
        appliedCount++;
      }
    }

    if (appliedCount === 0) {
      // Fallback: apply first spec in preset to active column if column names differ
      const firstPresetSpec = Object.values(preset.specs)[0];
      if (firstPresetSpec) {
        nextSpecs[selectedMetric] = { ...firstPresetSpec };
        appliedCount = 1;
      }
    }

    setSpecsByColumn(nextSpecs);
    notify(
      'success',
      `Artikelmall "${preset.name}" tillämpad på ${appliedCount} kolumn(er).`
    );
  };

  const handleSaveCurrentPreset = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) {
      notify('error', 'Ange ett artikelnamn för mallen.');
      return;
    }
    const specsSnapshot: Record<string, SpecLimits> = {};
    for (const col of columns) {
      specsSnapshot[col] =
        specsByColumn[col] || {
          ...suggestSpecLimits(extractMetricValues(rows, col)),
          uslLabel: 'USL',
          lslLabel: 'LSL',
        };
    }
    const created: ArticlePreset = {
      id: `preset-${Date.now()}`,
      name: trimmed,
      specs: specsSnapshot,
      updatedAt: new Date().toISOString(),
    };
    const updated = [created, ...articlePresets];
    setArticlePresets(updated);
    saveArticlePresets(updated);
    setSelectedPresetId(created.id);
    setNewPresetName('');
    setIsSavingPreset(false);
    notify('success', `Sparade artikelmall "${trimmed}" (${columns.length} kolumner).`);
  };

  const handleDeleteSelectedPreset = () => {
    if (!selectedPresetId) return;
    const target = articlePresets.find((p) => p.id === selectedPresetId);
    if (!target) return;
    const updated = articlePresets.filter((p) => p.id !== selectedPresetId);
    setArticlePresets(updated);
    saveArticlePresets(updated);
    setSelectedPresetId('');
    notify('info', `Tog bort artikelmall "${target.name}".`);
  };

  // Dataset Handlers
  const handleImportDataset = (
    importedRows: ProductionRow[],
    importedCols: string[],
    importedCatCols: string[],
    sourceName: string
  ) => {
    setIsStreaming(false);
    setRows(importedRows);
    setColumns(importedCols);
    setCategoryColumns(importedCatCols);
    setDatasetName(sourceName);
    setSelectedMetric(importedCols[0]);
    setSelectedPresetId('');
    setExcludedByMetric({});
    setAiAnalysis(null);
    setAnalysisError(null);

    // Suggest sensible initial tolerances for each imported column based on its real range
    const nextSpecs: Record<string, SpecLimits> = {};
    for (const col of importedCols) {
      const vals = extractMetricValues(importedRows, col);
      const suggested = suggestSpecLimits(vals);
      nextSpecs[col] = {
        ...suggested,
        uslLabel: 'USL',
        lslLabel: 'LSL',
      };
    }
    setSpecsByColumn(nextSpecs);
    setActiveTab('dashboard');
    notify(
      'success',
      `Importerade ${importedRows.length} rader, ${importedCols.length} mätkolumn(er)${
        importedCatCols.length > 0 ? ` och ${importedCatCols.length} gruppkolumn(er)` : ''
      } från "${sourceName}".`
    );
  };

  const handleResetToSample = () => {
    const fresh = generateSampleDataset(60);
    setIsStreaming(false);
    setRows(fresh.rows);
    setColumns(fresh.columns);
    setCategoryColumns(fresh.categoryColumns);
    setDatasetName(fresh.datasetName);
    setSelectedMetric(fresh.columns[0]);
    setSelectedPresetId('');
    setExcludedByMetric({});
    setAiAnalysis(null);
    setAnalysisError(null);

    const nextSpecs: Record<string, SpecLimits> = {};
    for (const col of fresh.columns) {
      const preset = SAMPLE_DATASET_SPECS[col];
      nextSpecs[col] = {
        usl: preset?.usl ?? 11.5,
        lsl: preset?.lsl ?? 8.5,
        target: preset?.target ?? 10.0,
        uslLabel: 'USL',
        lslLabel: 'LSL',
      };
    }
    setSpecsByColumn(nextSpecs);
    notify('info', 'Återställde till CNC-exempeldata (60 rader, 3 skift, 2 maskiner).');
  };

  const handleToggleStream = () => {
    if (!isStreaming) {
      const hasSampleCols = columns.includes('Diameter (mm)');
      if (!hasSampleCols) {
        handleResetToSample();
      }
      setIsStreaming(true);
      notify('info', 'Demoläge aktivt: simulerar ny mätpunkt var 2,5 sekund.');
    } else {
      setIsStreaming(false);
    }
  };

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setActiveTab('analysis');

    try {
      const sampledIndices = new Set<number>();
      const n = chartSeries.length;
      for (let i = 0; i < Math.min(10, n); i++) sampledIndices.add(i);
      for (let i = Math.max(0, n - 15); i < n; i++) sampledIndices.add(i);
      for (let i = 0; i < n; i++) {
        if (chartSeries[i].isOos || chartSeries[i].mrOutOfControl) {
          sampledIndices.add(i);
        }
      }
      if (n > 25) {
        const step = Math.max(1, Math.floor(n / 20));
        for (let i = 0; i < n; i += step) sampledIndices.add(i);
      }

      const sampledPoints = Array.from(sampledIndices)
        .sort((a, b) => a - b)
        .slice(0, 55)
        .map((i) => ({
          rowIndex: chartSeries[i].rowIndex,
          label: chartSeries[i].label,
          value: chartSeries[i].value,
          mr: chartSeries[i].mr,
        }));

      const byRule: Record<string, number> = {};
      for (const a of anomalies) {
        byRule[a.ruleCode] = (byRule[a.ruleCode] || 0) + 1;
      }

      const extendedContext = buildExtendedAnalysisContext({
        scope: aiScope,
        allRows: rows,
        activeRows,
        columns,
        categoryColumns,
        selectedMetric,
        spec: activeSpec,
        exclusions: activeExclusions,
        diagnosis,
        nonNormalCap,
        correlations,
        triageItems,
        stageSnapshot,
        regressionSnapshot,
        doeSnapshot,
      });

      setAiAnalysis('');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          datasetName,
          metric: selectedMetric,
          stats,
          anomalySummary: {
            total: anomalies.length,
            oosCount: stats.oosCount,
            mrOutOfControlCount: stats.mrOutOfControlCount,
            byRule,
            highlights: anomalies.slice(0, 20).map((a) => ({
              rowIndex: a.rowIndex,
              label: a.label,
              value: a.value,
              rule: a.ruleCode,
              explanation: a.explanation,
            })),
          },
          sampledPoints,
          totalRows: activeRows.length,
          extendedContext,
        }),
      });

      const extractErrorText = (errValue: unknown): string | null => {
        if (typeof errValue === 'string' && errValue.trim()) {
          return errValue.trim();
        }
        if (errValue && typeof errValue === 'object') {
          const obj = errValue as { code?: unknown; message?: unknown };
          const code = typeof obj.code === 'string' ? obj.code : '';
          const message = typeof obj.message === 'string' ? obj.message : '';
          if (code === 'NOT_FOUND') {
            return 'API-endpointen (/api/analyze) hittades inte på servern. Kontrollera att den senaste versionen med /api/analyze.ts är uppladdad till Vercel.';
          }
          if (message) {
            return code ? `${message} (${code})` : message;
          }
          try {
            return JSON.stringify(errValue);
          } catch {
            return null;
          }
        }
        return null;
      };

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      let finalReport = '';
      let finalStatus: 'RÖD' | 'GUL' | 'GRÖN' = 'GRÖN';

      if (response.ok && contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamedText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const dataLines = rawEvent
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim());
            if (dataLines.length === 0) continue;

            let eventPayload: {
              chunk?: string;
              done?: boolean;
              report?: string;
              status?: 'RÖD' | 'GUL' | 'GRÖN';
              error?: unknown;
            };
            try {
              eventPayload = JSON.parse(dataLines.join('\n'));
            } catch {
              continue;
            }

            const streamErr = extractErrorText(eventPayload.error);
            if (streamErr) {
              throw new Error(streamErr);
            }
            if (eventPayload.chunk) {
              streamedText += eventPayload.chunk;
              setAiAnalysis(streamedText);
            }
            if (eventPayload.done) {
              finalReport = eventPayload.report || streamedText;
              finalStatus = eventPayload.status || 'GRÖN';
            }
          }
        }

        if (!finalReport) {
          finalReport = streamedText.trim();
        }
        if (!finalReport) {
          throw new Error('AI-servern avslutade utan rapportdata. Försök igen.');
        }
        setAiAnalysis(finalReport);
      } else {
        const rawText = await response.text();
        let payload: { report?: string; status?: 'RÖD' | 'GUL' | 'GRÖN'; error?: unknown } | null = null;
        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const parsedErr = extractErrorText(payload?.error);
          if (parsedErr) {
            throw new Error(parsedErr);
          }
          if (response.status === 404) {
            throw new Error(
              'API-endpointen (/api/analyze) hittades inte (404). Deploya om projektet till Vercel så att /api/analyze.ts aktiveras.'
            );
          }
          if (response.status === 504 || response.status === 408) {
            throw new Error('Analysen tog för lång tid (timeout). Försök igen — servern svarade inte i tid.');
          }
          if (response.status === 502 || response.status === 503) {
            throw new Error('AI-servern är tillfälligt otillgänglig. Försök igen om ett par sekunder.');
          }
          throw new Error(`Servern svarade med HTTP ${response.status} i oväntat format. Ladda om sidan och försök igen.`);
        }

        if (!payload || typeof payload.report !== 'string') {
          throw new Error(
            'API-servern svarade med HTML i stället för analysdata. Kontrollera att backend-servern körs och försök igen.'
          );
        }

        finalReport = payload.report;
        finalStatus = payload.status || 'GRÖN';
        setAiAnalysis(finalReport);
      }

      if (user) {
        try {
          await saveUserReport({
            content: finalReport,
            status: finalStatus,
            metric: selectedMetric,
            datasetName,
            sampleCount: activeRows.length,
            userId: user.uid,
          });
          loadReports(user.uid);
          notify('success', 'AI-rapport genererad och sparad i din historik.');
        } catch {
          notify('info', 'AI-rapport genererad (kunde inte spara till molnhistoriken).');
        }
      } else {
        notify('success', 'AI-rapport genererad.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kunde inte kontakta AI-servern.';
      setAnalysisError(msg);
      notify('error', msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteUserReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      notify('success', 'Rapporten har raderats.');
    } catch {
      notify('error', 'Kunde inte radera rapporten.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className={isSixpackOpen ? 'no-print' : undefined}>
        <TopBar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenImport={() => setIsImportOpen(true)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
          user={user}
          onSignIn={handleSignIn}
          onSignOut={logout}
        />

        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-5">
          {/* Streamlined Executive Workspace Command Bar */}
          {(activeTab === 'dashboard' || activeTab === 'autopilot' || activeTab === 'data') && (
            <Card padding="none" className="no-print overflow-visible">
              {/* Top Command Row: Context + Action Hierarchy */}
              <div className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Aktivt dataset</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeRows.length} aktiva mätpunkter
                    </span>
                    {activeExcludedCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                          {activeExcludedCount} exkl. (Special Cause)
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{columns.length} mätkolumn(er)</span>
                    {categoryColumns.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {categoryColumns.length} grupp(er)
                        </span>
                      </>
                    )}
                    {isStreaming && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Demoström aktiv
                        </span>
                      </>
                    )}
                  </div>
                  <h1 className="text-lg font-semibold text-foreground tracking-tight truncate">
                    {datasetName}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={runAiAnalysis}
                    isLoading={isAnalyzing}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    {isAnalyzing ? 'Analyserar...' : 'Kör AI-analys'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCsvExportOpen(true)}
                    title="Exportera bearbetat dataset med exkluderade punkter och anomalier till CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportera CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSixpackOpen(true)}
                    title="Öppna 1-sides utskriftsklar Capability Sixpack (PPAP)"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Sixpack / PPAP
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsSopOpen(true)}>
                    <BookOpen className="w-3.5 h-3.5" />
                    Metodguide
                  </Button>

                  {/* Compact Tools Popover for secondary demo actions */}
                  <div className="relative">
                    <Button
                      variant={isStreaming ? 'danger' : 'outline'}
                      size="icon"
                      onClick={() => setIsToolsMenuOpen((prev) => !prev)}
                      title="Fler verktyg (Demoström & Exempeldata)"
                      aria-label="Fler verktyg"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>

                    {isToolsMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setIsToolsMenuOpen(false)}
                        />
                        <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl z-50 space-y-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setIsToolsMenuOpen(false);
                              handleToggleStream();
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-muted text-foreground transition-colors cursor-pointer"
                          >
                            {isStreaming ? (
                              <Pause className="w-3.5 h-3.5 text-rose-600" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-primary" />
                            )}
                            <span>{isStreaming ? 'Stoppa demoström' : 'Starta demoström'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsToolsMenuOpen(false);
                              handleResetToSample();
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-muted text-foreground transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Återställ CNC-exempeldata</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Unified Precision Metrology Bar: Metric + Tolerances + Article Preset */}
              <div className="px-5 py-3 border-t border-border bg-muted/30 rounded-b-xl flex flex-col xl:flex-row xl:items-end justify-between gap-3.5">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 flex-1">
                  <div className="col-span-2 space-y-1">
                    <label
                      htmlFor="metric-select"
                      className="text-[11px] font-medium text-muted-foreground block"
                    >
                      Analyserad kolumn
                    </label>
                    <select
                      id="metric-select"
                      value={selectedMetric}
                      onChange={(e) => setSelectedMetric(e.target.value)}
                      className="w-full h-8.5 px-2.5 text-xs font-semibold bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="lsl-input"
                      className="text-[11px] font-medium text-muted-foreground block"
                    >
                      LSL (Nedre)
                    </label>
                    <input
                      id="lsl-input"
                      type="number"
                      step="any"
                      value={activeSpec.lsl}
                      onChange={(e) => updateActiveSpec({ lsl: parseFloat(e.target.value) || 0 })}
                      className="w-full h-8.5 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="target-input"
                      className="text-[11px] font-medium text-muted-foreground block"
                    >
                      Målvärde
                    </label>
                    <input
                      id="target-input"
                      type="number"
                      step="any"
                      value={activeSpec.target}
                      onChange={(e) =>
                        updateActiveSpec({ target: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full h-8.5 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="usl-input"
                      className="text-[11px] font-medium text-muted-foreground block"
                    >
                      USL (Övre)
                    </label>
                    <input
                      id="usl-input"
                      type="number"
                      step="any"
                      value={activeSpec.usl}
                      onChange={(e) => updateActiveSpec({ usl: parseFloat(e.target.value) || 0 })}
                      className="w-full h-8.5 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Compact Article Presets Control */}
                <div className="xl:pl-4 xl:border-l border-border flex flex-wrap items-center gap-2 text-xs shrink-0">
                  <div className="space-y-1">
                    <label
                      htmlFor="article-preset-select"
                      className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"
                    >
                      <Bookmark className="w-3 h-3" />
                      Artikelmall
                    </label>
                    <div className="flex items-center gap-1.5">
                      {isSavingPreset ? (
                        <>
                          <input
                            type="text"
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveCurrentPreset();
                              if (e.key === 'Escape') setIsSavingPreset(false);
                            }}
                            placeholder="T.ex. Art. 55210 — Axel"
                            className="h-8.5 w-44 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                          <Button variant="primary" size="sm" onClick={handleSaveCurrentPreset}>
                            <Check className="w-3.5 h-3.5" />
                            Spara
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsSavingPreset(false)}
                            aria-label="Avbryt"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <select
                            id="article-preset-select"
                            value={selectedPresetId}
                            onChange={(e) => handleApplyPreset(e.target.value)}
                            className="h-8.5 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary max-w-[180px]"
                          >
                            <option value="">Välj sparad mall...</option>
                            {articlePresets.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {selectedPresetId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleDeleteSelectedPreset}
                              title="Ta bort vald artikelmall"
                              aria-label="Ta bort vald artikelmall"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-600" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setNewPresetName(datasetName);
                              setIsSavingPreset(true);
                            }}
                          >
                            Spara mall
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Active View */}
          {activeTab === 'dashboard' && (
            <div className="no-print space-y-6">
              <KpiOverview
                stats={stats}
                anomalies={anomalies}
                nonNormalPpk={nonNormalCap.ppk}
              />
              <ControlCharts
                rows={activeRows}
                allRows={rows}
                categoryColumns={categoryColumns}
                selectedMetric={selectedMetric}
                spec={activeSpec}
                onUpdateSpec={updateActiveSpec}
                stats={stats}
                series={chartSeries}
                anomalies={anomalies}
                excludedPoints={activeExclusions}
                onRequestExclude={setPointToExclude}
                onRestorePoint={handleRestorePoint}
                onRestoreAll={handleRestoreAllExcluded}
                showMovingAverage={showMovingAverage}
                onToggleMovingAverage={setShowMovingAverage}
                onStageSnapshotChange={setStageSnapshot}
              />
              <DistributionAndTrend
                histogram={histogram}
                binCount={distBins}
                onBinCountChange={setDistBins}
                stats={stats}
                spec={activeSpec}
                diagnosis={diagnosis}
                rollingHistory={rollingHistory}
                rollingWindow={rollingWindow}
                onRollingWindowChange={setRollingWindow}
                onRunAiAnalysis={runAiAnalysis}
                isAnalyzing={isAnalyzing}
              />
            </div>
          )}

          {activeTab === 'autopilot' && (
            <div className="no-print">
              <AutopilotView
                rows={activeRows}
                columns={columns}
                categoryColumns={categoryColumns}
                selectedMetric={selectedMetric}
                spec={activeSpec}
                stats={stats}
                chartSeries={chartSeries}
                triageItems={triageItems}
                nonNormalCap={nonNormalCap}
                qqPoints={qqPoints}
                correlations={correlations}
                onSelectMetric={(col, jumpToDashboard) => {
                  setSelectedMetric(col);
                  if (jumpToDashboard) {
                    setActiveTab('dashboard');
                  }
                }}
                onOpenRegression={() => setActiveTab('regression')}
              />
            </div>
          )}

          {activeTab === 'regression' && (
            <div className="no-print">
              <RegressionView
                rows={activeRows}
                columns={columns}
                selectedMetric={selectedMetric}
                spec={activeSpec}
                onSelectMetric={setSelectedMetric}
                onNotify={notify}
                onRegressionSnapshotChange={setRegressionSnapshot}
              />
            </div>
          )}

          {activeTab === 'doe' && (
            <div className="no-print">
              <DoeView onNotify={notify} onDoeSnapshotChange={handleDoeSnapshotChange} />
            </div>
          )}

          {activeTab === 'data' && (
            <div className="no-print">
              <DataTableView
                rows={rows}
                columns={columns}
                categoryColumns={categoryColumns}
                selectedMetric={selectedMetric}
                stats={stats}
                anomaliesByRow={anomaliesByRow}
                excludedPoints={activeExclusions}
                onRequestExclude={setPointToExclude}
                onRestorePoint={handleRestorePoint}
                onRestoreAll={handleRestoreAllExcluded}
                onOpenCsvExport={() => setIsCsvExportOpen(true)}
                datasetName={datasetName}
                onNotify={notify}
              />
            </div>
          )}

          {activeTab === 'analysis' && (
            <AiAnalysisView
              datasetName={datasetName}
              selectedMetric={selectedMetric}
              rowCount={activeRows.length}
              aiAnalysis={aiAnalysis}
              analysisError={analysisError}
              isAnalyzing={isAnalyzing}
              aiScope={aiScope}
              scopeMeta={{
                excludedCount: activeExcludedCount,
                stageCount: stageSnapshot?.stages.length ?? 1,
                correlationCount: correlations.length,
                triageCount: triageItems.length,
                canRunRegression: columns.length >= 2 && activeRows.length >= 6,
                hasDoeData: Boolean(doeSnapshot),
                doeLabel: doeSnapshot
                  ? `${doeSnapshot.experimentName} (${doeSnapshot.designLabel}, ${doeSnapshot.nCompleted}/${doeSnapshot.nTotal} körningar)`
                  : null,
              }}
              onChangeScope={(patch) => setAiScope((prev) => ({ ...prev, ...patch }))}
              onRunAnalysis={runAiAnalysis}
              onPrint={() => window.print()}
            />
          )}

          {activeTab === 'history' && (
            <div className="no-print">
              <HistoryView
                user={user}
                reports={reports}
                isLoading={isLoadingReports}
                onSignIn={handleSignIn}
                onRefresh={() => user && loadReports(user.uid)}
                onOpenReport={(report) => {
                  setAiAnalysis(report.content);
                  setAnalysisError(null);
                  setActiveTab('analysis');
                }}
                onDeleteReport={handleDeleteReport}
              />
            </div>
          )}
        </main>
      </div>

      <SixpackPrintModal
        isOpen={isSixpackOpen}
        onClose={() => setIsSixpackOpen(false)}
        datasetName={datasetName}
        selectedMetric={selectedMetric}
        spec={activeSpec}
        stats={stats}
        anomalies={anomalies}
        series={chartSeries}
        histogram={histogram}
        nonNormalCap={nonNormalCap}
        qqPoints={qqPoints}
        excludedCount={activeExcludedCount}
      />

      <ExcludePointModal
        point={pointToExclude}
        onClose={() => setPointToExclude(null)}
        onConfirm={handleConfirmExclude}
      />

      <CsvExportModal
        isOpen={isCsvExportOpen}
        onClose={() => setIsCsvExportOpen(false)}
        rows={rows}
        columns={columns}
        categoryColumns={categoryColumns}
        selectedMetric={selectedMetric}
        stats={stats}
        anomaliesByRow={anomaliesByRow}
        excludedPoints={activeExclusions}
        specsByColumn={specsByColumn}
        excludedByMetric={excludedByMetric}
        stageSnapshot={stageSnapshot}
        correlations={correlations}
        regressionSnapshot={regressionSnapshot}
        doeSnapshot={doeSnapshot}
        datasetName={datasetName}
        onNotify={notify}
      />

      <ImportWizard
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportDataset}
        downloadTemplate={downloadExcelTemplate}
        onNotify={notify}
      />

      <SopModal isOpen={isSopOpen} onClose={() => setIsSopOpen(false)} />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
