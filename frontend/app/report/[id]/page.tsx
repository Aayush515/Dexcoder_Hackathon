"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

const NAVY = "#0A1628";
const STORAGE_KEY = "cam_result";

const PARAM_LABELS = [
  "Financial Health",
  "Cash Flow Stability",
  "Debt Burden",
  "Promoter Integrity",
  "GST Compliance",
  "External Risk Factors",
] as const;

type CamResult = {
  analysis_id: string;
  company_name: string;
  loan_amount?: string;
  risk_score: number | null;
  risk_category: string;
  financial_analysis: string;
  risk_assessment: string;
  cam_report: string;
  news_intel: string;
};

function parseRiskParameterScores(text: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const label of PARAM_LABELS) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reScore = new RegExp(
      `${esc}[\\s\\S]{0,200}?(\\d+(?:\\.\\d+)?)\\s*/\\s*10`,
      "i"
    );
    const reFallback = new RegExp(
      `${esc}[:\s]+(\\d+(?:\\.\\d+)?)`,
      "i"
    );

    let v: number | null = null;
    const m = text.match(reScore);
    if (m) {
      v = Number(parseFloat(m[1]));
    } else {
      const m2 = text.match(reFallback);
      if (m2) {
        v = Number(parseFloat(m2[1]));
      }
    }

    if (v !== null && Number.isFinite(v)) {
      out[label] = Math.min(10, Math.max(0, v));
    } else {
      out[label] = null;
    }
  }
  return out;
}

function deriveCategoryFromScore(score: number | null): string {
  if (score == null || Number.isNaN(score)) return "AMBER";
  if (score <= 3.9) return "GREEN";
  if (score <= 6.9) return "AMBER";
  return "RED";
}

function parseRiskScoreFromText(riskText: string): number | null {
  if (!riskText) return null;

  const normalized = riskText.trim();

  // Prefer explicit overall risk rating declarations.
  const explicit = normalized.match(
    /Overall\s*Risk\s*(?:Rating)?\s*[:\-]?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*10|\s*out of\s*10)?/i
  );
  if (explicit) {
    const parsed = Number(parseFloat(explicit[1]));
    if (Number.isFinite(parsed)) {
      return Math.min(10, Math.max(0, parsed));
    }
  }

  // Fallback to any in-text score mention like "7.4/10" or "7.4 out of 10".
  const fallback = normalized.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*10|out of\s*10)/i);
  if (fallback) {
    const parsed = Number(parseFloat(fallback[1]));
    if (Number.isFinite(parsed)) {
      return Math.min(10, Math.max(0, parsed));
    }
  }

  return null;
}

function fallbackParameterScores(
  riskScore: number | null
): Record<string, number | null> {
  if (riskScore == null || Number.isNaN(riskScore)) {
    return {
      "Financial Health": 5.0,
      "Cash Flow Stability": 5.0,
      "Debt Burden": 5.0,
      "Promoter Integrity": 5.0,
      "GST Compliance": 5.0,
      "External Risk Factors": 5.0,
    };
  }
  const base = Math.min(10, Math.max(0, riskScore));
  const clamp = (v: number) => Math.min(10, Math.max(0, Number(v.toFixed(1))));
  return {
    "Financial Health": clamp(base - 0.8),
    "Cash Flow Stability": clamp(base - 0.4),
    "Debt Burden": clamp(base + 0.3),
    "Promoter Integrity": clamp(base + 0.5),
    "GST Compliance": clamp(base - 0.2),
    "External Risk Factors": clamp(base + 0.2),
  };
}

function splitCamSections(cam: string): { title: string; body: string }[] {
  const trimmed = cam.trim();
  if (!trimmed) return [];
  const re =
    /(?:^|\n)(\d+\.\s+[^\n]+)\n([\s\S]*?)(?=\n\d+\.\s+[^\n]+|$)/g;
  const parts: { title: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    parts.push({ title: m[1].trim(), body: m[2].trim() });
  }
  if (parts.length === 0) {
    return [{ title: "Credit Appraisal Memo", body: trimmed }];
  }
  return parts;
}

function newsToBullets(newsIntel: string): string[] {
  return newsIntel
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function barTone(score: number): string {
  if (score <= 3) return "bg-emerald-500";
  if (score <= 6) return "bg-amber-500";
  return "bg-red-500";
}

function formatScoreDisplay(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v}/10`;
}

const SKELETON_MIN_MS = 450;

const GAUGE_CX = 120;
const GAUGE_CY = 108;
const GAUGE_R = 88;
const NEEDLE_LEN = 78;

function gaugePoint(score: number, cx: number, cy: number, r: number) {
  const clamped = Math.min(10, Math.max(0, score));
  const θ = Math.PI * (1 - clamped / 10);
  return {
    x: cx + r * Math.cos(θ),
    y: cy - r * Math.sin(θ),
  };
}

function arcPathD(s0: number, s1: number): string {
  const p0 = gaugePoint(s0, GAUGE_CX, GAUGE_CY, GAUGE_R);
  const p1 = gaugePoint(s1, GAUGE_CX, GAUGE_CY, GAUGE_R);
  return `M ${p0.x} ${p0.y} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${p1.x} ${p1.y}`;
}

function riskLevelLabel(score: number | null): string {
  if (score == null || Number.isNaN(score)) return "SCORE UNAVAILABLE";
  if (score <= 3.9) return "LOW RISK";
  if (score <= 6.9) return "MEDIUM RISK";
  return "HIGH RISK";
}

/** API / localStorage may store score as number or string; iOS Safari needs robust parsing. */
function coerceRiskScore(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, n));
}

function needleTip(score: number, cx: number, cy: number, len: number) {
  const clamped = Math.min(10, Math.max(0, score));
  const θ = Math.PI * (1 - clamped / 10);
  return {
    x: cx + len * Math.cos(θ),
    y: cy - len * Math.sin(θ),
  };
}

function RiskMeter({ riskScore }: { riskScore: number | null }) {
  const filterId = useId().replace(/:/g, "");
  const resolved = coerceRiskScore(riskScore);
  const target = resolved ?? 0;
  const [needleScore, setNeedleScore] = useState(0);

  useEffect(() => {
    setNeedleScore(0);
    const end = target;
    let startTs: number | null = null;
    let frame = 0;
    const duration = 1500;

    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      const p = Math.min(1, (now - startTs) / duration);
      const eased = 1 - (1 - p) ** 3;
      setNeedleScore(end * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const tip = needleTip(needleScore, GAUGE_CX, GAUGE_CY, NEEDLE_LEN);
  const clampedNeedle = Math.min(10, Math.max(0, needleScore));
  const theta = Math.PI * (1 - clampedNeedle / 10);
  const arrowSize = 8;
  const arrowBack = {
    x: tip.x - arrowSize * Math.cos(theta),
    y: tip.y + arrowSize * Math.sin(theta),
  };
  const arrowLeft = {
    x: arrowBack.x + arrowSize * Math.cos(theta - Math.PI / 2),
    y: arrowBack.y - arrowSize * Math.sin(theta - Math.PI / 2),
  };
  const arrowRight = {
    x: arrowBack.x + arrowSize * Math.cos(theta + Math.PI / 2),
    y: arrowBack.y - arrowSize * Math.sin(theta + Math.PI / 2),
  };
  const arrowPoints = `${tip.x},${tip.y} ${arrowLeft.x},${arrowLeft.y} ${arrowRight.x},${arrowRight.y}`;

  const displayScore = resolved;

  return (
    <section
      className="w-full border-b border-white/10 px-4 py-8 sm:px-6 print:break-inside-avoid"
      style={{ backgroundColor: "#071018" }}
      aria-label="Risk meter"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h2 className="text-lg font-bold uppercase tracking-[0.12em] text-white sm:text-xl">
            Overall risk
          </h2>
          <p className="mt-1 text-sm text-white/60">
            Lending risk index (1 = lowest, 10 = highest)
          </p>
        </div>
        <div className="flex flex-col items-center">
          <svg
            viewBox="0 0 240 118"
            className="h-auto w-full max-w-md"
            role="img"
            aria-hidden
          >
            <defs>
              <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.35" />
              </filter>
            </defs>
            {/* Zones: GREEN 0–3.9, AMBER 4–6.9, RED 7–10 */}
            <path
              d={arcPathD(0, 3.9)}
              fill="none"
              stroke="#15803d"
              strokeWidth={14}
              strokeLinecap="round"
              className="opacity-95"
            />
            <path
              d={arcPathD(4, 6.9)}
              fill="none"
              stroke="#d97706"
              strokeWidth={14}
              strokeLinecap="round"
              className="opacity-95"
            />
            <path
              d={arcPathD(7, 10)}
              fill="none"
              stroke="#b91c1c"
              strokeWidth={14}
              strokeLinecap="round"
              className="opacity-95"
            />
            {/* Tick marks at zone boundaries */}
            {[4, 7].map((s) => {
              const inner = gaugePoint(s, GAUGE_CX, GAUGE_CY, GAUGE_R - 10);
              const outer = gaugePoint(s, GAUGE_CX, GAUGE_CY, GAUGE_R + 4);
              return (
                <line
                  key={s}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={1}
                />
              );
            })}
            {/* Needle: animate line endpoints (iOS Safari often ignores CSS transform on SVG groups) */}
            <line
              x1={GAUGE_CX}
              y1={GAUGE_CY}
              x2={tip.x}
              y2={tip.y}
              stroke="#f8fafc"
              strokeWidth={3.5}
              strokeLinecap="round"
              filter={`url(#${filterId})`}
            />
            <polygon
              points={arrowPoints}
              fill="#f8fafc"
              filter={`url(#${filterId})`}
            />
            <circle
              cx={GAUGE_CX}
              cy={GAUGE_CY}
              r={7}
              fill="#f8fafc"
              stroke="#0A1628"
              strokeWidth={2}
            />
          </svg>
          <div className="mt-2 flex flex-col items-center text-center">
            <p
              className="text-5xl font-bold leading-none text-white sm:text-6xl"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {displayScore != null ? (
                <>
                  <span>{displayScore.toFixed(1).replace(/\.0$/, "")}</span>
                  <span className="text-3xl font-semibold text-white/75 sm:text-4xl">
                    /10
                  </span>
                </>
              ) : (
                <span className="text-2xl text-white/80">Not scored</span>
              )}
            </p>
            <p className="mt-4 text-base font-bold uppercase tracking-[0.08em] text-white">
              {riskLevelLabel(displayScore)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200 ${className ?? ""}`}
      aria-hidden
    />
  );
}

function ReportPageSkeleton() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto max-w-5xl">
          <SkeletonBar className="h-4 w-36" />
        </div>
      </div>
      <header
        className="border-b border-slate-800/20 px-6 py-8"
        style={{ backgroundColor: NAVY }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <SkeletonBar className="h-10 w-3/4 max-w-md bg-white/20" />
            <SkeletonBar className="h-5 w-48 bg-white/15" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <SkeletonBar className="h-24 w-32 bg-white/15" />
            <SkeletonBar className="h-10 w-24 rounded-full bg-white/15" />
            <SkeletonBar className="h-10 w-28 bg-white/20" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <section>
          <SkeletonBar className="mb-4 h-4 w-28" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5"
              >
                <SkeletonBar className="h-4 w-40" />
                <SkeletonBar className="mt-4 h-9 w-16" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <SkeletonBar className="mb-4 h-4 w-48" />
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div
                key={k}
                className="flex items-center gap-4 border-b border-slate-100 py-3 last:border-0"
              >
                <SkeletonBar className="h-4 flex-1" />
                <SkeletonBar className="h-4 w-12" />
                <SkeletonBar className="h-2.5 w-40 rounded-full" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <SkeletonBar className="mb-4 h-4 w-56" />
          <div className="space-y-4">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <SkeletonBar className="h-5 w-64" />
                <SkeletonBar className="mt-4 h-3 w-full" />
                <SkeletonBar className="mt-2 h-3 w-full" />
                <SkeletonBar className="mt-2 h-3 max-w-xl" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <SkeletonBar className="mb-4 h-4 w-40" />
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-6">
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="mt-3 h-3 w-[92%]" />
            <SkeletonBar className="mt-3 h-3 w-[85%]" />
          </div>
        </section>
      </main>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<CamResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const started = performance.now();
    let missingFlag = false;
    let parsed: CamResult | null = null;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        missingFlag = true;
      } else {
        const p = JSON.parse(raw) as CamResult;
        if (id && p.analysis_id && p.analysis_id !== id) {
          missingFlag = true;
        } else {
          parsed = p;
        }
      }
    } catch {
      missingFlag = true;
    }

    const finish = () => {
      if (missingFlag) {
        setMissing(true);
      } else if (parsed) {
        setData(parsed);
      }
      setReady(true);
    };

    const elapsed = performance.now() - started;
    const wait = Math.max(0, SKELETON_MIN_MS - elapsed);
    const t = window.setTimeout(finish, wait);
    return () => window.clearTimeout(t);
  }, [id]);

  const paramScores = useMemo(() => {
    if (!data) return {};
    const parsed = parseRiskParameterScores(data.risk_assessment);
    const hasAny = Object.values(parsed).some((v) => v != null);
    if (hasAny) return parsed;
    return fallbackParameterScores(coerceRiskScore(data.risk_score));
  }, [data]);

  const camSections = useMemo(
    () => (data ? splitCamSections(data.cam_report) : []),
    [data]
  );

  const newsBullets = useMemo(
    () => (data ? newsToBullets(data.news_intel) : []),
    [data]
  );

  const showScoreFallback =
    data && data.risk_assessment ? data.risk_assessment.trim().length > 0 : false;

  if (!ready) {
    return <ReportPageSkeleton />;
  }

  if (missing || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-slate-600">
        <p className="text-center">No report found. Run an analysis from the home page.</p>
        <Link
          href="/"
          className="rounded-lg px-5 py-2.5 font-medium text-white"
          style={{ backgroundColor: NAVY }}
        >
          ← New Analysis
        </Link>
      </div>
    );
  }

  const riskScoreFromData = coerceRiskScore(data.risk_score);
  const riskScoreFromText = parseRiskScoreFromText(data.risk_assessment);
  const resolvedRiskScore =
    riskScoreFromData != null ? riskScoreFromData : riskScoreFromText;

  const category = (
    data.risk_category && data.risk_category !== "UNKNOWN"
      ? data.risk_category
      : deriveCategoryFromScore(resolvedRiskScore)
  ).toUpperCase();
  const pillClass =
    category === "GREEN"
      ? "bg-emerald-600 text-white"
      : category === "RED"
        ? "bg-red-600 text-white"
        : category === "AMBER"
          ? "bg-amber-500 text-slate-900"
          : "bg-slate-400 text-white";

  const fh = paramScores["Financial Health"];
  const cf = paramScores["Cash Flow Stability"];
  const pi = paramScores["Promoter Integrity"];

  return (
    <div className="min-h-screen bg-white text-slate-800 print:bg-white">
      <div className="border-b border-slate-200 bg-white px-6 py-3 print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
            style={{ color: NAVY }}
          >
            ← New Analysis
          </Link>
        </div>
      </div>

      <RiskMeter riskScore={resolvedRiskScore} />

      <header
        className="border-b border-slate-800/20 px-6 py-8 text-white print:border-slate-300"
        style={{ backgroundColor: NAVY }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              {data.company_name}
            </h1>
            <p className="mt-2 text-lg text-white/80">
              Loan amount requested:{" "}
              <span className="font-semibold text-white">
                {data.loan_amount ?? "—"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 print:flex-nowrap">
            <span
              className={`inline-flex rounded-full px-5 py-2 text-sm font-bold uppercase tracking-wide ${pillClass}`}
            >
              {category}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-white/30 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white/95 print:hidden"
            >
              Download PDF
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <section>
          <h2
            className="mb-4 text-sm font-bold uppercase tracking-wider"
            style={{ color: NAVY }}
          >
            Key scores
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Financial Health Score", value: fh },
              { label: "Cash Flow Score", value: cf },
              { label: "Promoter Integrity Score", value: pi },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm"
              >
                <p className="text-sm font-medium text-slate-600">{card.label}</p>
                <p
                  className="mt-3 text-3xl font-bold tabular-nums"
                  style={{ color: NAVY }}
                >
                  {formatScoreDisplay(card.value)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2
            className="mb-4 text-sm font-bold uppercase tracking-wider"
            style={{ color: NAVY }}
          >
            Risk parameter breakdown
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Parameter
                  </th>
                  <th className="w-28 px-4 py-3 font-semibold text-slate-700">
                    Score
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Scale
                  </th>
                </tr>
              </thead>
              <tbody>
                {PARAM_LABELS.map((label) => {
                  const score = paramScores[label];
                  const pct =
                    score != null ? Math.min(100, (score / 10) * 100) : 0;
                  return (
                    <tr key={label} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {label}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {formatScoreDisplay(score)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                          {score != null && (
                            <div
                              className={`h-full rounded-full transition-all ${barTone(score)}`}
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2
            className="mb-4 text-sm font-bold uppercase tracking-wider"
            style={{ color: NAVY }}
          >
            Credit Appraisal Memo
          </h2>
          <div className="space-y-4">
            {camSections.map((sec, i) => (
              <article
                key={`${sec.title}-${i}`}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:break-inside-avoid"
              >
                <h3
                  className="mb-3 text-base font-bold"
                  style={{ color: NAVY }}
                >
                  {sec.title}
                </h3>
                <div className="max-w-none text-sm leading-relaxed text-slate-700">
                  {sec.body.split("\n").map((para, j) => (
                    <p key={j} className="mb-3 last:mb-0">
                      {para}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2
            className="mb-4 text-sm font-bold uppercase tracking-wider"
            style={{ color: NAVY }}
          >
            News intelligence
          </h2>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-6">
            {newsBullets.length === 0 ? (
              <p className="text-sm text-slate-600">No news items listed.</p>
            ) : (
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
                {newsBullets.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {showScoreFallback && (
          <section>
            <h2
              className="mb-4 text-sm font-bold uppercase tracking-wider"
              style={{ color: NAVY }}
            >
              Raw risk assessment (debug)
            </h2>
            <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              {data?.risk_assessment}
            </pre>
          </section>
        )}
      </main>
    </div>
  );
}
