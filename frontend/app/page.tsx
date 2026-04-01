"use client";

import axios from "axios";
import {
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Upload,
  X,
  FlaskConical,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const NAVY = "#0A1628";
const ACCENT = "#2563EB";

const INDUSTRIES = [
  "Banking",
  "Manufacturing",
  "Real Estate",
  "IT Services",
  "Retail",
  "Other",
] as const;

const STEPS = [
  "Parsing documents...",
  "Analyzing financials...",
  "Fetching external intelligence...",
  "Assessing risk...",
  "Generating CAM report...",
] as const;

const CAM_STORAGE_KEY = "cam_result";

const DEMO_COMPANY = "Apex Manufacturing Pvt Ltd";
const DEMO_LOAN = "₹2,50,00,000";
const DEMO_INDUSTRY = "Manufacturing";

const DEMO_FINANCIAL_TEXT = `Apex Manufacturing Pvt Ltd — Summary financials (demo)

Revenue FY22: ₹18.2 Cr, FY23: ₹22.7 Cr, FY24: ₹26.1 Cr
EBITDA margin: 14%, 15.2%, 16.1%
Net Profit: ₹1.8Cr, ₹2.4Cr, ₹3.1Cr
Total Debt: ₹8.5Cr
Current Assets: ₹12Cr, Current Liabilities: ₹7Cr
Director: Rajesh Sharma

Notes: Illustrative figures for product demonstration only.
`;

function formatApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ERR_NETWORK" || !err.response) {
      return (
        err.message ||
        "Network error — check that the API is running (e.g. uvicorn on port 8000)."
      );
    }
    const data = err.response.data;
    if (data && typeof data === "object" && "detail" in data) {
      const detail = (data as { detail: unknown }).detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) => {
            if (item && typeof item === "object" && "msg" in item) {
              return String((item as { msg: string }).msg);
            }
            return typeof item === "string" ? item : JSON.stringify(item);
          })
          .join("; ");
      }
      return String(detail);
    }
    return (
      err.response.statusText || `Request failed (${err.response.status})`
    );
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export default function Home() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showErrorToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 8000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const next: File[] = [];
    const arr = Array.from(incoming);
    for (const f of arr) {
      const name = f.name.toLowerCase();
      if (
        name.endsWith(".pdf") ||
        name.endsWith(".xlsx") ||
        name.endsWith(".xls") ||
        name.endsWith(".txt")
      ) {
        next.push(f);
      }
    }
    if (next.length) {
      setFiles((prev) => [...prev, ...next]);
    }
  }, []);

  const loadDemoData = useCallback(() => {
    setCompanyName(DEMO_COMPANY);
    setLoanAmount(DEMO_LOAN);
    setIndustry(DEMO_INDUSTRY);
    const blob = new Blob([DEMO_FINANCIAL_TEXT], {
      type: "text/plain;charset=utf-8",
    });
    const demoFile = new File(
      [blob],
      "apex_balance_sheet_pl_demo.txt",
      { type: "text/plain" }
    );
    setFiles([demoFile]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!loading) {
      setCompletedSteps(0);
      return;
    }
    const id = window.setInterval(() => {
      setCompletedSteps((c) => Math.min(c + 1, STEPS.length));
    }, 3000);
    return () => window.clearInterval(id);
  }, [loading]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    if (!companyName.trim()) {
      showErrorToast("Company name is required.");
      return;
    }
    if (!loanAmount.trim()) {
      showErrorToast("Loan amount is required.");
      return;
    }
    if (files.length === 0) {
      showErrorToast("Please upload at least one PDF, Excel, or text file.");
      return;
    }

    setLoading(true);
    setCompletedSteps(0);

    const formData = new FormData();
    formData.append("company_name", companyName.trim());
    formData.append("loan_amount", loanAmount.trim());
    formData.append("industry", industry);
    files.forEach((f) => formData.append("files", f));

    try {
      const uploadRes = await axios.post<{ analysis_id: string }>(
        `${API_BASE}/upload`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      const { analysis_id } = uploadRes.data;

      const analyzeRes = await axios.post(
        `${API_BASE}/analyze/${analysis_id}`,
        {
          company_name: companyName.trim(),
          loan_amount: loanAmount.trim(),
        },
        { headers: { "Content-Type": "application/json" } }
      );

      setCompletedSteps(STEPS.length);
      localStorage.setItem(
        CAM_STORAGE_KEY,
        JSON.stringify({
          ...analyzeRes.data,
          loan_amount: loanAmount.trim(),
        })
      );
      router.push(`/report/${analysis_id}`);
    } catch (err: unknown) {
      showErrorToast(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen text-white"
      style={{ backgroundColor: NAVY }}
    >
      {toast && (
        <div
          role="alert"
          className="fixed right-4 top-4 z-[100] max-w-md rounded-lg border border-red-400/40 bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-xl print:hidden"
        >
          <div className="flex items-start gap-3">
            <span className="flex-1 leading-snug">{toast}</span>
            <button
              type="button"
              onClick={() => {
                setToast(null);
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              }}
              className="shrink-0 rounded p-0.5 hover:bg-white/20"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <header
        className="border-b border-white/10 px-6 py-4"
        style={{ backgroundColor: "#071018" }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: ACCENT }}
          >
            <Sparkles className="h-5 w-5 text-white" aria-hidden />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Corporate Credit AI
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <section className="mb-12 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            AI-Powered Credit Appraisal
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Upload financials. Get a CAM report in minutes.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-2xl space-y-8 rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-xl backdrop-blur-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/60">
              Judges: load sample data to run a full demo without real files.
            </p>
            <button
              type="button"
              onClick={loadDemoData}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FlaskConical className="h-4 w-4 text-amber-300" aria-hidden />
              Load Demo Data
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="company" className="text-sm font-medium text-white/90">
              Company Name <span style={{ color: ACCENT }}>*</span>
            </label>
            <div className="relative">
              <Building2
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                aria-hidden
              />
              <input
                id="company"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Manufacturing Pvt Ltd"
                className="w-full rounded-lg border border-white/15 bg-[#0A1628] py-3 pl-10 pr-4 text-white placeholder:text-white/35 outline-none ring-0 transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="loan" className="text-sm font-medium text-white/90">
              Loan Amount Requested <span style={{ color: ACCENT }}>*</span>
            </label>
            <input
              id="loan"
              type="text"
              required
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              placeholder="e.g. ₹50,00,000"
              className="w-full rounded-lg border border-white/15 bg-[#0A1628] px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="industry" className="text-sm font-medium text-white/90">
              Industry
            </label>
            <select
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-white/15 bg-[#0A1628] px-4 py-3 text-white outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              disabled={loading}
            >
              {INDUSTRIES.map((opt) => (
                <option key={opt} value={opt} className="bg-[#0A1628]">
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-white/90">
              Financial documents
            </span>
            <div
              role="button"
              tabIndex={0}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed border-white/20 bg-[#0A1628]/80 px-6 py-12 text-center transition hover:border-[#2563EB]/60 hover:bg-[#0A1628]"
            >
              <Upload
                className="mx-auto h-10 w-10 text-[#2563EB]"
                aria-hidden
              />
              <p className="mt-3 text-sm font-medium text-white/90">
                Drag & drop PDF, Excel, or text files here
              </p>
              <p className="mt-1 text-xs text-white/45">
                Multiple files supported (.pdf, .xlsx, .xls, .txt)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
                disabled={loading}
              />
            </div>

            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0A1628] px-3 py-2 text-sm"
                  >
                    <span className="truncate text-white/85">{f.name}</span>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeFile(i);
                      }}
                      className="shrink-0 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
                      aria-label={`Remove ${f.name}`}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-base font-semibold text-white shadow-lg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Running analysis…
              </>
            ) : (
              <>Run Analysis →</>
            )}
          </button>
        </form>

        {loading && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ backgroundColor: "rgba(10, 22, 40, 0.92)" }}
          >
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A1628] p-8 shadow-2xl">
              <p className="mb-6 text-center text-sm font-medium uppercase tracking-wider text-[#2563EB]">
                Processing
              </p>
              <ol className="space-y-4">
                {STEPS.map((label, i) => {
                  const stepNum = i + 1;
                  const done = completedSteps > i;
                  const isActive =
                    completedSteps === i && completedSteps < STEPS.length;
                  return (
                    <li key={label} className="flex items-start gap-3">
                      {done ? (
                        <CheckCircle2
                          className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"
                          aria-hidden
                        />
                      ) : isActive ? (
                        <Loader2
                          className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#2563EB]"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="mt-0.5 h-5 w-5 shrink-0 text-white/25"
                          aria-hidden
                        />
                      )}
                      <span
                        className={
                          done
                            ? "text-white/80"
                            : isActive
                              ? "font-medium text-white"
                              : "text-white/40"
                        }
                      >
                        Step {stepNum}: {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
