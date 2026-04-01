import asyncio
import uuid
from typing import Dict, List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.excel_parser import extract_text_from_excel
from services.pdf_parser import extract_text_from_pdf
from store import set_extractions

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".txt"}


@router.get("/")
async def upload_root():
    return {"message": "upload routes"}


@router.post("/")
async def upload_documents(
    company_name: str = Form(...),
    loan_amount: str = Form(...),
    industry: str = Form("Other"),
    files: List[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    analysis_id = str(uuid.uuid4())
    docs: Dict[str, str] = {}

    for uf in files:
        raw_name = uf.filename or "document"
        lower = raw_name.lower()
        ext = ""
        if "." in lower:
            ext = "." + lower.rsplit(".", 1)[-1]
        if ext not in ALLOWED_EXTENSIONS:
            continue

        content = await uf.read()
        if ext == ".pdf":
            text = await asyncio.to_thread(extract_text_from_pdf, content)
        elif ext == ".txt":
            text = content.decode("utf-8", errors="replace")
        else:
            text = await asyncio.to_thread(extract_text_from_excel, content)

        key = raw_name
        base = key
        n = 0
        while key in docs:
            n += 1
            key = f"{base}_{n}"
        docs[key] = text

    if not docs:
        raise HTTPException(
            status_code=400,
            detail="No valid PDF, Excel, or text files were processed",
        )

    set_extractions(analysis_id, docs)
    return {
        "analysis_id": analysis_id,
        "company_name": company_name,
        "loan_amount": loan_amount,
        "industry": industry,
    }
