import React from 'react';
import Markdown from 'react-markdown';
import {
  Brain,
  Download,
  AlertCircle,
  RefreshCw,
  Check,
  Sparkles,
  Split,
  TrendingUp,
  FlaskConical,
  Activity,
} from 'lucide-react';
import { AiScopeOptions } from '@/src/lib/aiContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '@/src/lib/utils';

interface AiScopeMeta {
  excludedCount: number;
  stageCount: number;
  correlationCount: number;
  triageCount: number;
  canRunRegression: boolean;
  hasDoeData: boolean;
  doeLabel: string | null;
}

interface AiAnalysisViewProps {
  datasetName: string;
  selectedMetric: string;
  rowCount: number;
  aiAnalysis: string | null;
  analysisError: string | null;
  isAnalyzing: boolean;
  aiScope: AiScopeOptions;
  scopeMeta: AiScopeMeta;
  onChangeScope: (patch: Partial<AiScopeOptions>) => void;
  onRunAnalysis: () => void;
  onPrint: () => void;
}

export function AiAnalysisView({
  datasetName,
  selectedMetric,
  rowCount,
  aiAnalysis,
  analysisError,
  isAnalyzing,
  aiScope,
  scopeMeta,
  onChangeScope,
  onRunAnalysis,
  onPrint,
}: AiAnalysisViewProps) {
  const activeCount =
    1 +
    (aiScope.includeAutopilot ? 1 : 0) +
    (aiScope.includeStagesAndExclusions ? 1 : 0) +
    (aiScope.includeRegression && scopeMeta.canRunRegression ? 1 : 0) +
    (aiScope.includeDoe && scopeMeta.hasDoeData ? 1 : 0);

  return (
    <section aria-label="AI-analys" className="max-w-4xl mx-auto space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">AI-produktionsanalys</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {datasetName} · {selectedMetric} ·{' '}
            <span className="font-mono tabular-nums">{rowCount} mätpunkter</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {aiAnalysis && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Download className="w-4 h-4" />
              Skriv ut / Spara PDF
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onRunAnalysis}
            isLoading={isAnalyzing}
          >
            <Brain className="w-4 h-4" />
            {isAnalyzing ? 'Analyserar...' : aiAnalysis ? 'Kör ny analys' : 'Starta AI-analys'}
          </Button>
        </div>
      </div>

      {/* Scope selector strip: shows exactly which modules Gemini analyzes */}
      <Card padding="sm" className="no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-border">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Analysomfång för AI-rapporten
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Välj vilka moduler som ska ingå i underlaget när Gemini skriver ingenjörsrapporten.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
            {activeCount} moduler aktiva
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {/* Core SPC — always active */}
          <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-primary/30 bg-primary/5">
            <span className="w-4 h-4 mt-0.5 rounded bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Check className="w-3 h-3" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Grund-SPC &amp; Nelson</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                I-MR, Cpk/Ppk, normalitet &amp; PPM (alltid med)
              </p>
            </div>
          </div>

          {/* Autopilot */}
          <button
            type="button"
            onClick={() => onChangeScope({ includeAutopilot: !aiScope.includeAutopilot })}
            disabled={isAnalyzing}
            className={cn(
              'text-left flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-60',
              aiScope.includeAutopilot
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-card hover:bg-muted/40'
            )}
          >
            <span
              className={cn(
                'w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border',
                aiScope.includeAutopilot
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border bg-background'
              )}
            >
              {aiScope.includeAutopilot && <Check className="w-3 h-3" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Autopilot &amp; Korrelation</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Icke-normal Ppk, {scopeMeta.correlationCount} korrelationer, {scopeMeta.triageCount} variabler &amp; ANOVA
              </p>
            </div>
          </button>

          {/* Stages & Exclusions */}
          <button
            type="button"
            onClick={() =>
              onChangeScope({ includeStagesAndExclusions: !aiScope.includeStagesAndExclusions })
            }
            disabled={isAnalyzing}
            className={cn(
              'text-left flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-60',
              aiScope.includeStagesAndExclusions
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-card hover:bg-muted/40'
            )}
          >
            <span
              className={cn(
                'w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border',
                aiScope.includeStagesAndExclusions
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border bg-background'
              )}
            >
              {aiScope.includeStagesAndExclusions && <Check className="w-3 h-3" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Split className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Faser &amp; Exkluderingar</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {scopeMeta.stageCount > 1 ? `${scopeMeta.stageCount} faser` : 'Auto-skiftsökning'} ·{' '}
                {scopeMeta.excludedCount} exkluderade
              </p>
            </div>
          </button>

          {/* Regression & Fitted Line */}
          <button
            type="button"
            onClick={() => onChangeScope({ includeRegression: !aiScope.includeRegression })}
            disabled={isAnalyzing || !scopeMeta.canRunRegression}
            className={cn(
              'text-left flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
              aiScope.includeRegression && scopeMeta.canRunRegression
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-card hover:bg-muted/40'
            )}
          >
            <span
              className={cn(
                'w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border',
                aiScope.includeRegression && scopeMeta.canRunRegression
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border bg-background'
              )}
            >
              {aiScope.includeRegression && scopeMeta.canRunRegression && <Check className="w-3 h-3" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Regression &amp; Fitted Line</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {scopeMeta.canRunRegression
                  ? 'Multipel regression, VIF & bästa kurvform'
                  : 'Kräver minst 2 numeriska kolumner'}
              </p>
            </div>
          </button>

          {/* DOE */}
          <button
            type="button"
            onClick={() => onChangeScope({ includeDoe: !aiScope.includeDoe })}
            disabled={isAnalyzing || !scopeMeta.hasDoeData}
            className={cn(
              'text-left flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed sm:col-span-2',
              aiScope.includeDoe && scopeMeta.hasDoeData
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-card hover:bg-muted/40'
            )}
          >
            <span
              className={cn(
                'w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border',
                aiScope.includeDoe && scopeMeta.hasDoeData
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border bg-background'
              )}
            >
              {aiScope.includeDoe && scopeMeta.hasDoeData && <Check className="w-3 h-3" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <FlaskConical className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>DOE (Försöksplanering)</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {scopeMeta.hasDoeData
                  ? scopeMeta.doeLabel || 'Effekter, samspel, krökning & optimering'
                  : 'Öppna DOE-fliken och fyll i resultat (Y) för att ta med försök'}
              </p>
            </div>
          </button>
        </div>
      </Card>

      <Card padding="none" className="card-print">
        <div className="p-6 sm:p-8">
          <div className="hidden print:block mb-6 border-b border-border pb-4">
            <h1 className="text-xl font-bold text-foreground">AI-produktionsanalys (Fullt omfång)</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {datasetName} · {selectedMetric} · {rowCount} mätpunkter ·{' '}
              {new Date().toLocaleDateString('sv-SE')}
            </p>
          </div>

          {analysisError && !isAnalyzing && (
            <div className="mb-6 p-4 rounded-lg border border-rose-500/30 bg-rose-500/5 flex items-start gap-3 text-sm text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Analysen kunde inte slutföras</p>
                <p className="text-xs">{analysisError}</p>
              </div>
            </div>
          )}

          {isAnalyzing && !aiAnalysis ? (
            <div className="py-12 space-y-6">
              <div className="flex flex-col items-center text-center gap-3">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    Kör fullständig SPC-, modell- och rotorsaksanalys
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Analyserar {activeCount} aktiva moduler över {rowCount} mätpunkter (I-MR,
                    kapabilitet, korrelationer, faser, regression och eventuella DOE-resultat)...
                  </p>
                </div>
              </div>
              <div className="max-w-lg mx-auto space-y-2.5 pt-2">
                <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
                <div className="h-3.5 bg-muted rounded animate-pulse w-5/6" />
                <div className="h-3.5 bg-muted rounded animate-pulse w-4/6" />
              </div>
            </div>
          ) : !aiAnalysis ? (
            <div className="py-14 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Brain className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-semibold text-foreground">
                  Ingen rapport genererad ännu
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Gemini analyserar nu hela produktionsunderlaget — inklusive grund-SPC,
                  Autopilot (icke-normal Ppk, korrelationer, batch-triage, kategori-ANOVA),
                  faser, exkluderingsorsaker, Regression/Fitted Line och DOE.
                </p>
              </div>
              <Button variant="primary" size="md" onClick={onRunAnalysis}>
                <Brain className="w-4 h-4" />
                Starta AI-analys
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {isAnalyzing && (
                <div className="no-print flex items-center gap-2 text-xs text-primary font-medium pb-2 border-b border-border">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Skriver rapport i realtid...
                </div>
              )}
              <div className="prose max-w-none text-sm sm:text-base">
                <Markdown>{aiAnalysis}</Markdown>
              </div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
