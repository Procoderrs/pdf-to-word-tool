"""
PDF Analyzer — Stage 1 of the pipeline.
Inspects a PDF before conversion: is it encrypted, does it have a text layer.
"""
import fitz  # PyMuPDF


def inspect_pdf(path):
    doc = fitz.open(path)
    try:
        encrypted = doc.is_encrypted
        has_text = False
        if not encrypted:
            for page in doc:
                if page.get_text().strip():
                    has_text = True
                    break
        return {'encrypted': encrypted, 'has_text': has_text}
    finally:
        doc.close()


def page_has_text(text_dict):
    """Checks if a PyMuPDF text-dict actually contains any real text blocks."""
    for block in text_dict.get("blocks", []):
        if block["type"] == 0:
            for line in block["lines"]:
                for span in line["spans"]:
                    if span["text"].strip():
                        return True
    return False