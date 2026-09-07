import fitz
import sys, json, os
import warnings
warnings.filterwarnings("ignore")

fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_display_warnings(False)


def get_bg_color(pix, x, y, dpi=150):
    scale = dpi / 72
    px = max(0, min(int(x * scale), pix.width - 1))
    py = max(0, min(int(y * scale), pix.height - 1))
    pixel = pix.pixel(px, py)
    return tuple(c / 255 for c in pixel[:3])


def extract_pdf(pdf_path, output_dir, dpi=120):
    doc = fitz.open(pdf_path)
    pages_data = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        page_width = page.rect.width
        page_height = page.rect.height

        pre_pix = page.get_pixmap(dpi=dpi)

        text_dict = page.get_text("dict")
        spans_data = []

        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue

            for line in block.get("lines", []):
                line_spans = line.get("spans", [])
                if not line_spans:
                    continue

                combined_text = "".join(s.get("text", "") for s in line_spans)
                if not combined_text.strip():
                    continue

                x0 = min(s["bbox"][0] for s in line_spans)
                y0 = min(s["bbox"][1] for s in line_spans)
                x1 = max(s["bbox"][2] for s in line_spans)
                y1 = max(s["bbox"][3] for s in line_spans)

                first_span = line_spans[0]
                color_int = first_span.get("color", 0)
                r = (color_int >> 16) & 255
                g = (color_int >> 8) & 255
                b = color_int & 255
                flags = first_span.get("flags", 0)

                spans_data.append({
                    "text": combined_text,
                    "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                    "font": first_span.get("font", ""),
                    "size": first_span.get("size", 12),
                    "color": f"{r:02X}{g:02X}{b:02X}",
                    "bold": bool(flags & 16),
                    "italic": bool(flags & 2),
                })

                bg_color = get_bg_color(pre_pix, (x0 + x1) / 2, y0 - 1, dpi=dpi)
                page.add_redact_annot(fitz.Rect(x0, y0, x1, y1), fill=bg_color)

        page.apply_redactions()

        pix = page.get_pixmap(dpi=dpi)
        img_path = os.path.join(output_dir, f"page-{page_num + 1}.jpg")
        pix.save(img_path, jpg_quality=85)

        pages_data.append({
            "page_number": page_num + 1,
            "width": page_width,
            "height": page_height,
            "image": img_path,
            "spans": spans_data,
        })

    return pages_data


if __name__ == "__main__":
    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)
    result = extract_pdf(pdf_path, output_dir)

    json_path = os.path.join(output_dir, "extract_result.json")
    with open(json_path, "w") as f:
        json.dump(result, f)

    print(json_path)