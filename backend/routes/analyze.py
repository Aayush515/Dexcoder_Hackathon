import asyncio
import re
from typing import Dict, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.claude_analyst import (
    analyze_financials,
    assess_risk,
    generate_cam,
)
from services.news_intel import fetch_company_news
from store import get_extractions

router = APIRouter()


class AnalyzeRequest(BaseModel):
    company_name: str
    loan_amount: str


def _classify_document_key(key: str) -> str:
    k = key.lower()
    if "gst" in k:
        return "gst"
    if "bank" in k or "statement" in k:
        return "bank"
    if "balance" in k or "pl" in k or "profit" in k:
        return "financial"
    return "unmatched"


def _partition_documents(docs: Dict[str, str]) -> Tuple[str, str, str]:
    financial_parts: list[str] = []
    bank_parts: list[str] = []
    gst_parts: list[str] = []
    for key, text in docs.items():
        cat = _classify_document_key(key)
        if cat == "gst":
            gst_parts.append(text)
        elif cat == "bank":
            bank_parts.append(text)
        elif cat == "financial":
            financial_parts.append(text)
        else:
            financial_parts.append(text)
    return (
        "\n\n".join(financial_parts),
        "\n\n".join(bank_parts),
        "\n\n".join(gst_parts),
    )


def _parse_risk_category(risk_assessment: str) -> str:
    m = re.search(
        r"Risk\s+Category:\s*(GREEN|AMBER|RED)\b",
        risk_assessment,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).upper()
    for cat in ("RED", "AMBER", "GREEN"):
        if re.search(rf"\b{cat}\b", risk_assessment, re.IGNORECASE):
            return cat
    return "UNKNOWN"


def _parse_risk_score(risk_assessment: str) -> Optional[float]:
    m = re.search(
        r"Overall\s+Risk\s+Rating:\s*(\d+(?:\.\d+)?)\s*/\s*10",
        risk_assessment,
        re.IGNORECASE,
    )
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*10", risk_assessment)
    if m:
        return float(m.group(1))
    return None


def _clamp_score(score: float) -> float:
    return max(1.0, min(10.0, round(score, 1)))


def _is_error_text(text: str) -> bool:
    return text.strip().lower().startswith("error:")


def _derive_category(score: float) -> str:
    if score <= 3.9:
        return "GREEN"
    if score <= 6.9:
        return "AMBER"
    return "RED"


def _fallback_financial_analysis(financial_text: str, bank_text: str) -> str:
    merged = f"{financial_text}\n{bank_text}".strip()
    sample = "\n".join(
        [line.strip() for line in merged.splitlines() if line.strip()][:20]
    )
    if not sample:
        sample = "No detailed extracted financial text available."
    return (
        "Structured Financial Analysis (fallback mode)\n"
        "1. Revenue trend (3 years if available): Refer extracted lines below.\n"
        "2. EBITDA and PAT margins: Not reliably computable from fallback parser.\n"
        "3. Key ratios (Debt/Equity, Current Ratio, Interest Coverage, DSCR): "
        "Insufficient normalized statements for accurate computation.\n"
        "4. Top 3 financial strengths:\n"
        "   - Business submitted multi-document financial package.\n"
        "   - Core balance/P&L indicators appear present in source docs.\n"
        "   - Bank/GST cross-check can be performed in manual review.\n"
        "5. Top 3 red flags:\n"
        "   - AI model response unavailable; this is a fallback analysis.\n"
        "   - Some metrics may be incomplete or unstandardized.\n"
        "   - Manual analyst validation required before sanction.\n"
        "6. Overall financial health score out of 10: 6.0/10\n\n"
        "Extracted source sample:\n"
        f"{sample}"
    )


def _fallback_risk_assessment(
    financial_text: str, news_intel: str, gst_text: str
) -> Tuple[str, float, str]:
    risk_score = 5.8

    has_gst = bool(gst_text.strip())
    if has_gst:
        risk_score -= 0.4
    else:
        risk_score += 0.7

    lower_fin = financial_text.lower()
    if "fraud" in lower_fin or "default" in lower_fin or "scam" in lower_fin:
        risk_score += 1.5

    growth_hint = re.search(
        r"revenue.*fy22.*?(\d+(?:\.\d+)?)\D+fy23.*?(\d+(?:\.\d+)?)\D+fy24.*?(\d+(?:\.\d+)?)",
        lower_fin,
        re.IGNORECASE,
    )
    if growth_hint:
        try:
            y1 = float(growth_hint.group(1))
            y2 = float(growth_hint.group(2))
            y3 = float(growth_hint.group(3))
            if y1 < y2 < y3:
                risk_score -= 0.8
        except Exception:
            pass

    if news_intel.strip() == "No external news data available.":
        risk_score += 0.2

    risk_score = _clamp_score(risk_score)
    category = _derive_category(risk_score)

    fin_h = _clamp_score(risk_score - 0.8)
    cash = _clamp_score(risk_score - 0.3)
    debt = _clamp_score(risk_score + 0.2)
    promoter = _clamp_score(risk_score + 0.5)
    gst = _clamp_score(risk_score - 0.4 if has_gst else risk_score + 0.6)
    external = _clamp_score(risk_score + 0.1)

    text = (
        f"1. Overall Risk Rating: {risk_score}/10 (1=lowest risk, 10=highest risk)\n"
        f"2. Risk Category: {category}\n"
        "3. Risk breakdown across 6 parameters (score each /10):\n"
        f"   - Financial Health: {fin_h}/10\n"
        f"   - Cash Flow Stability: {cash}/10\n"
        f"   - Debt Burden: {debt}/10\n"
        f"   - Promoter Integrity: {promoter}/10\n"
        f"   - GST Compliance: {gst}/10\n"
        f"   - External Risk Factors: {external}/10\n"
        "4. Top 5 specific risk flags:\n"
        "   - AI model output unavailable; fallback scoring used.\n"
        "   - Validate audited financial statements before final sanction.\n"
        "   - Cross-check promoter/legal profile from independent sources.\n"
        "   - Confirm banking turnover consistency with declared revenue.\n"
        "   - Reconcile GST filings with sales ledger.\n"
        "5. Top 3 mitigating factors:\n"
        "   - Structured document set was received for analysis.\n"
        "   - Risk scoring framework applied consistently.\n"
        "   - Final decision can be strengthened with manual analyst review."
    )
    return text, risk_score, category


def _fallback_cam(
    company_name: str,
    loan_amount: str,
    financial_analysis: str,
    risk_assessment: str,
    news_intel: str,
) -> str:
    return (
        "1. EXECUTIVE SUMMARY\n"
        f"{company_name} has requested a facility of {loan_amount}. "
        "This CAM is generated in fallback mode because the AI model response "
        "was unavailable. Manual credit review is mandatory.\n\n"
        "2. FINANCIAL PERFORMANCE (3-year trend)\n"
        f"{financial_analysis}\n\n"
        "3. KEY FINANCIAL RATIOS (table format)\n"
        "Ratio | Observation\n"
        "Debt/Equity | Requires analyst computation from audited statements\n"
        "Current Ratio | Requires analyst computation from audited statements\n"
        "Interest Coverage | Requires analyst computation from audited statements\n"
        "DSCR | Requires analyst computation from projected cashflows\n\n"
        "4. BANKING & GST ANALYSIS\n"
        "Banking and GST inputs should be reconciled against declared turnover "
        "before sanction recommendation.\n\n"
        "5. PROMOTER INTELLIGENCE\n"
        f"{news_intel}\n\n"
        "6. RISK ASSESSMENT SUMMARY\n"
        f"{risk_assessment}\n\n"
        "7. LENDING RECOMMENDATION (must clearly state: APPROVE / REJECT / CONDITIONAL APPROVE)\n"
        "CONDITIONAL APPROVE subject to satisfactory manual validation of financials, "
        "bank statements, GST consistency, and promoter checks.\n\n"
        "8. CONDITIONS & COVENANTS (if approving)\n"
        "- Submission of latest audited financial statements and provisional numbers.\n"
        "- Minimum DSCR and leverage covenant to be documented.\n"
        "- Quarterly GST and bank statement monitoring.\n"
        "- No material adverse legal event covenant."
    )


@router.get("/")
async def analyze_root():
    return {"message": "analyze routes"}


@router.post("/{analysis_id}")
async def run_analysis(analysis_id: str, body: AnalyzeRequest):
    print(f"[analyze] Step 1: Retrieving extractions for analysis_id={analysis_id}")
    docs = get_extractions(analysis_id)
    if not docs:
        raise HTTPException(status_code=404, detail="analysis_id not found")

    print("[analyze] Step 2: Partitioning documents (financial / bank / gst)")
    financial_text, bank_text, gst_text = _partition_documents(docs)

    print("[analyze] Step 3: analyze_financials(financial_text + bank_text)")
    financial_analysis = await asyncio.to_thread(
        analyze_financials,
        financial_text + bank_text,
    )
    if _is_error_text(financial_analysis):
        print("[analyze] Step 3b: Using fallback financial analysis")
        financial_analysis = _fallback_financial_analysis(financial_text, bank_text)

    print(f"[analyze] Step 4: fetch_company_news({body.company_name!r})")
    news_intel = await asyncio.to_thread(fetch_company_news, body.company_name)

    print("[analyze] Step 5: assess_risk(...)")
    risk_assessment = await asyncio.to_thread(
        assess_risk,
        financial_analysis,
        news_intel,
        gst_text,
    )
    fallback_score: Optional[float] = None
    fallback_category: Optional[str] = None
    if _is_error_text(risk_assessment):
        print("[analyze] Step 5b: Using fallback risk assessment")
        risk_assessment, fallback_score, fallback_category = _fallback_risk_assessment(
            financial_text + "\n" + bank_text,
            news_intel,
            gst_text,
        )

    print("[analyze] Step 6: Parsing risk_category from risk_assessment")
    risk_category = _parse_risk_category(risk_assessment)

    print("[analyze] Step 7: Parsing overall risk score (X/10)")
    risk_score = _parse_risk_score(risk_assessment)
    if risk_score is None and fallback_score is not None:
        risk_score = fallback_score
    if (risk_category == "UNKNOWN" or not risk_category) and fallback_category:
        risk_category = fallback_category
    if (risk_category == "UNKNOWN" or not risk_category) and risk_score is not None:
        risk_category = _derive_category(risk_score)

    print("[analyze] Step 8: generate_cam(...)")
    cam_report = await asyncio.to_thread(
        generate_cam,
        body.company_name,
        body.loan_amount,
        financial_analysis,
        risk_assessment,
        news_intel,
    )
    if _is_error_text(cam_report):
        print("[analyze] Step 8b: Using fallback CAM report")
        cam_report = _fallback_cam(
            body.company_name,
            body.loan_amount,
            financial_analysis,
            risk_assessment,
            news_intel,
        )

    print("[analyze] Step 9: Returning JSON response")

    return {
        "analysis_id": analysis_id,
        "company_name": body.company_name,
        "loan_amount": body.loan_amount,
        "risk_score": risk_score,
        "risk_category": risk_category,
        "financial_analysis": financial_analysis,
        "risk_assessment": risk_assessment,
        "cam_report": cam_report,
        "news_intel": news_intel,
    }
