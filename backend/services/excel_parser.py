import io

import pandas as pd


def extract_text_from_excel(file_bytes: bytes) -> str:
    try:
        sheets = pd.read_excel(
            io.BytesIO(file_bytes),
            sheet_name=None,
            engine="openpyxl",
        )
        if not isinstance(sheets, dict):
            sheets = {"Sheet1": sheets}
        parts: list[str] = []
        for sheet_name, df in sheets.items():
            header = f"=== {sheet_name} ===\n"
            body = df.to_string(index=False)
            parts.append(header + body)
        return "\n\n".join(parts)
    except Exception:
        return ""
