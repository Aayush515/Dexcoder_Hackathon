import os

import httpx
from dotenv import load_dotenv

SERPER_SEARCH_URL = "https://google.serper.dev/search"

load_dotenv()


def fetch_company_news(company_name: str) -> str:
    api_key = (os.getenv("SERPER_API_KEY") or "").strip()
    if not api_key:
        return "No external news data available."

    queries = [
        f"{company_name} fraud OR scam OR default OR court case India",
        f"{company_name} promoter founder legal case",
    ]

    try:
        all_items: list[dict] = []
        with httpx.Client(timeout=30.0) as client:
            for q in queries:
                response = client.post(
                    SERPER_SEARCH_URL,
                    headers={"X-API-KEY": api_key},
                    json={"q": q},
                )
                response.raise_for_status()
                data = response.json()
                organic = data.get("organic") or []
                if isinstance(organic, list):
                    all_items.extend(organic)

        selected: list[dict] = []
        for item in all_items:
            if isinstance(item, dict):
                selected.append(item)
            if len(selected) >= 5:
                break
        if not selected:
            return "No external news data available."

        lines: list[str] = []
        for i, item in enumerate(selected, start=1):
            title = (item.get("title") or "").strip()
            snippet = (item.get("snippet") or "").strip()
            lines.append(f"News Item {i}: {title} - {snippet}")
        return "\n".join(lines)
    except Exception:
        return "No external news data available."
