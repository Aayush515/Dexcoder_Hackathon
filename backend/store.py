"""In-memory store: analysis_id -> { document_key: extracted_text }."""

from typing import Dict, Optional

extractions: Dict[str, Dict[str, str]] = {}


def get_extractions(analysis_id: str) -> Optional[Dict[str, str]]:
    return extractions.get(analysis_id)


def set_extractions(analysis_id: str, documents: Dict[str, str]) -> None:
    extractions[analysis_id] = documents
