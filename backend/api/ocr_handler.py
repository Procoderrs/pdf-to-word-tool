"""
OCR Handler — Stage 2 of the pipeline (Scanned PDF -> OCR branch).
Falls back to PyMuPDF's built-in Tesseract integration when a page has
no extractable text layer at all.

DEPLOYMENT NOTE: get_textpage_ocr requires the Tesseract binary to be
installed on the host OS. This will NOT work on Vercel serverless
functions (no native binaries allowed there). Fine on Render/Railway/a
VM where you control OS packages — or swap this for a cloud OCR API
call if Vercel is the hard requirement.
"""
from .pdf_analyzer import page_has_text


def get_page_text_dict(page):
    """
    Returns (text_dict, used_ocr: bool) for a page. If the page has no
    extractable text (flattened/rasterized image page), falls back to OCR.
    """
    text_dict = page.get_text("dict")

    if page_has_text(text_dict):
        return text_dict, False

    try:
        ocr_textpage = page.get_textpage_ocr(flags=0, dpi=300, full=True, language="eng")
        ocr_dict = page.get_text("dict", textpage=ocr_textpage)
        if page_has_text(ocr_dict):
            return ocr_dict, True
    except Exception as e:
        print(f"OCR fallback failed: {e}")

    return text_dict, False