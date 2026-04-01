import io
from typing import Any, List, Optional

import pdfplumber


def _cell_str(cell: Any) -> str:
    if cell is None:
        return ""
    return str(cell).strip()


def _format_table(table: Optional[List[Optional[List[Any]]]]) -> str:
    if not table:
        return ""
    lines: List[str] = []
    for row in table:
        if row is None:
            continue
        lines.append(" | ".join(_cell_str(c) for c in row))
    if not lines:
        return ""
    return "Table:\n" + "\n".join(lines)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        parts: List[str] = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text and text.strip():
                    parts.append(text.strip())
                try:
                    tables = page.extract_tables() or []
                except Exception:
                    tables = []
                for table in tables:
                    formatted = _format_table(table)
                    if formatted:
                        parts.append(formatted)
        return "\n\n".join(parts)
    except Exception:
        return ""
