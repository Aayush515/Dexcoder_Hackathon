import os
from typing import Optional

import anthropic
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

_MODEL = "claude-sonnet-4-5"
_MAX_TOKENS = 4000


def _client() -> Optional[Anthropic]:
    key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        return None
    return Anthropic(api_key=key)


def _text_from_response(message: anthropic.types.Message) -> str:
    parts: list[str] = []
    for block in message.content:
        if block.type == "text":
            parts.append(block.text)
    return "".join(parts).strip()


def _call(system: str, user: str) -> str:
    client = _client()
    if client is None:
        return "Error: ANTHROPIC_API_KEY is not set."
    try:
        message = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return _text_from_response(message) or "Error: Empty model response."
    except anthropic.AnthropicError as e:
        return f"Error: Anthropic API request failed ({e})."
    except Exception as e:
        return f"Error: {e}"


def analyze_financials(financial_text: str) -> str:
    system = (
        "You are a senior credit analyst at an Indian bank. "
        "Analyze financial documents and extract key insights."
    )
    user = f"""Analyze these financial documents and return a structured analysis with:
1. Revenue trend (3 years if available)
2. EBITDA and PAT margins
3. Key ratios: Debt/Equity, Current Ratio, Interest Coverage, DSCR
4. Top 3 financial strengths
5. Top 3 financial red flags or concerns
6. Overall financial health score out of 10

Financial Data:
{financial_text}

Be specific with numbers. Flag any inconsistencies."""
    return _call(system, user)


def assess_risk(financial_analysis: str, news_intel: str, gst_text: str) -> str:
    system = "You are a credit risk officer. Assess lending risk based on provided data."
    user = f"""Based on this data, provide a risk assessment:

FINANCIAL ANALYSIS:
{financial_analysis}

EXTERNAL NEWS & INTEL:
{news_intel}

GST DATA:
{gst_text}

Return:
1. Overall Risk Rating: X/10 (1=lowest risk, 10=highest risk)
2. Risk Category: GREEN (low) / AMBER (medium) / RED (high)
3. Risk breakdown across 6 parameters (score each /10):
   - Financial Health
   - Cash Flow Stability
   - Debt Burden
   - Promoter Integrity
   - GST Compliance
   - External Risk Factors
4. Top 5 specific risk flags
5. Top 3 mitigating factors"""
    return _call(system, user)


def generate_cam(
    company_name: str,
    loan_amount: str,
    financial_analysis: str,
    risk_assessment: str,
    news_intel: str,
) -> str:
    system = (
        "You are a credit analyst writing a formal Credit Appraisal Memo (CAM) "
        "for an Indian bank."
    )
    user = f"""Write a complete Credit Appraisal Memo for:
Company: {company_name}
Loan Amount Requested: {loan_amount}

Use this data:
FINANCIAL ANALYSIS: {financial_analysis}
RISK ASSESSMENT: {risk_assessment}
EXTERNAL INTEL: {news_intel}

CAM must have these exact sections:
1. EXECUTIVE SUMMARY
2. FINANCIAL PERFORMANCE (3-year trend)
3. KEY FINANCIAL RATIOS (table format)
4. BANKING & GST ANALYSIS
5. PROMOTER INTELLIGENCE
6. RISK ASSESSMENT SUMMARY
7. LENDING RECOMMENDATION (must clearly state: APPROVE / REJECT / CONDITIONAL APPROVE)
8. CONDITIONS & COVENANTS (if approving)

Write in formal bank language. Be specific. Recommendation must be decisive."""
    return _call(system, user)
