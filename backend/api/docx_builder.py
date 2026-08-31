"""
DOCX Engine — Stage 4/5 of the pipeline: takes parsed PDF pages and
builds the final .docx (paragraphs, runs, tables, images), applying
layout ordering from layout_parser.
"""
import io
import fitz
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

from ocr_handler import get_page_text_dict
from layout_parser import (
    clean_font_name, get_heading_style, enable_hyphenation,
    rects_overlap_ratio, spans_need_space, set_run_font,
    find_column_gap, order_items_for_columns, get_sidebar_fill_color,
    get_page_background_color,
    FULL_WIDTH_RATIO_THRESHOLD,
)
from table_handler import add_table_to_doc

FLAG_ITALIC = 2
FLAG_BOLD = 16
POINTS_PER_INCH = 72
TABLE_OVERLAP_THRESHOLD = 0.5
CENTER_TOLERANCE_PT = 15  # how close a block's center must be to the content center to count as "centered"
NARROW_BLOCK_RATIO = 0.85  # a block must be narrower than this fraction of content width to be eligible for centering


def detect_page_margins(pdf, page_width_pt):
    """Scan all pages' text blocks to find the real left/right content
    boundary, instead of assuming a fixed 1-inch margin. Returns the
    margins in inches plus the raw (min_x0, max_x1) content bounds in
    points, which callers use for width-aware centering decisions."""
    min_x0, max_x1 = page_width_pt, 0
    for page in pdf:
        text_dict = page.get_text("dict")
        for block in text_dict["blocks"]:
            if block["type"] == 0:
                min_x0 = min(min_x0, block["bbox"][0])
                max_x1 = max(max_x1, block["bbox"][2])
    if min_x0 >= max_x1:
        # no text found anywhere — fall back to a sane default
        return 1.0, 1.0, (0, page_width_pt)
    left_margin_in = max(min_x0 / POINTS_PER_INCH, 0.4)
    right_margin_in = max((page_width_pt - max_x1) / POINTS_PER_INCH, 0.4)
    return left_margin_in, right_margin_in, (min_x0, max_x1)


def set_document_background(document, rgb):
    """Sets Word's page background color (w:background) and ensures it
    actually displays on-screen (w:displayBackgroundShape in settings —
    without this, Word only shows the background when printing/exporting,
    not while viewing). NOTE: this is a document-wide setting in the
    .docx format — Word has no concept of a different background per
    page, so if a PDF's pages have different backgrounds, only one
    (whichever is passed in) can be applied to the whole document."""
    hex_color = '{:02X}{:02X}{:02X}'.format(*rgb)

    background = OxmlElement('w:background')
    background.set(qn('w:color'), hex_color)
    document.element.insert(0, background)

    settings_element = document.settings.element
    display_bg = OxmlElement('w:displayBackgroundShape')
    settings_element.insert(0, display_bg)


def add_block_to_container(container, block, page_width_pt=None, content_bounds=None):
    """container = document OR a table cell — both support add_paragraph().
    page_width_pt / content_bounds are optional; when given, enables
    content-width-aware center-alignment detection for the block."""
    if block["type"] == 0:
        lines = block["lines"]

        # Compute the "typical" (normal, same-paragraph) line-to-line gap.
        # Include ALL gaps — negative ones too — since those represent
        # ordinary wrapped-line spacing. A real paragraph break shows up
        # as a gap noticeably larger than this typical value.
        line_gaps = []
        for i in range(1, len(lines)):
            gap = lines[i]["bbox"][1] - lines[i - 1]["bbox"][3]
            line_gaps.append(gap)
        line_gaps.sort()
        typical_gap = line_gaps[len(line_gaps) // 2] if line_gaps else 0

        # Margin tuned against real PDF measurements: same-paragraph
        # wrapped-line gaps top out around +0.16pt above typical, while
        # genuine paragraph breaks start around +0.22pt above typical.
        # 0.19 sits between the two.
        split_threshold = typical_gap + 0.19

        paragraph = container.add_paragraph()
        max_size_in_paragraph = 0
        prev_span = None
        prev_line_bbox = None

        def apply_heading_style_to(para, size):
            heading_style = get_heading_style(size)
            if heading_style:
                if heading_style['center']:
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in para.runs:
                    run.font.size = heading_style['size']
                    run.bold = heading_style['bold']
                    if heading_style['italic']:
                        run.italic = True

        for line_index, line in enumerate(lines):
            if prev_line_bbox is not None:
                gap = line["bbox"][1] - prev_line_bbox[3]
                will_split = gap >= split_threshold

                if will_split:
                    apply_heading_style_to(paragraph, max_size_in_paragraph)
                    paragraph = container.add_paragraph()
                    max_size_in_paragraph = 0
                    prev_span = None
                else:
                    paragraph.add_run(" ")

            for span in line["spans"]:
                text = span["text"]
                if not text.strip():
                    continue

                if spans_need_space(prev_span, span):
                    paragraph.add_run(" ")

                run = paragraph.add_run(text)
                span_size = span["size"]
                max_size_in_paragraph = max(max_size_in_paragraph, span_size)
                run.font.size = Pt(round(span_size))
                set_run_font(run, clean_font_name(span.get("font", "")))

                flags = span["flags"]
                run.bold = bool(flags & FLAG_BOLD)
                run.italic = bool(flags & FLAG_ITALIC)

                color_int = span.get("color", 0)
                r = (color_int >> 16) & 255
                g = (color_int >> 8) & 255
                b = color_int & 255
                run.font.color.rgb = RGBColor(r, g, b)

                prev_span = span

            prev_line_bbox = line["bbox"]

        apply_heading_style_to(paragraph, max_size_in_paragraph)

        # Content-width-aware center detection. A full-width body
        # paragraph's midpoint often lands near the content center too
        # (symmetric margins) — that used to false-positive as "centered".
        # A block is only centered when it's clearly NARROWER than the
        # content column (a heading, a short line, a page number).
        if content_bounds:
            min_x0, max_x1 = content_bounds
            content_width = max_x1 - min_x0
            content_center = (min_x0 + max_x1) / 2

            block_bbox = block["bbox"]
            block_width = block_bbox[2] - block_bbox[0]
            block_center = (block_bbox[0] + block_bbox[2]) / 2

            block_text = " ".join(
                span["text"] for line in lines for span in line["spans"]
            ).strip()
            is_page_number = block_text.isdigit() and len(block_text) <= 4

            is_narrow_and_centered = (
                block_width < content_width * NARROW_BLOCK_RATIO
                and abs(block_center - content_center) < CENTER_TOLERANCE_PT
            )

            if is_page_number or is_narrow_and_centered:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif page_width_pt:
            # fallback if content_bounds wasn't passed — old, less
            # accurate behavior, kept only for backward compatibility
            block_bbox = block["bbox"]
            block_center = (block_bbox[0] + block_bbox[2]) / 2
            page_center = page_width_pt / 2
            if abs(block_center - page_center) < CENTER_TOLERANCE_PT:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

    elif block["type"] == 1:
        image_bytes = block.get("image")
        if not image_bytes:
            return
        bbox = block["bbox"]
        width_in = (bbox[2] - bbox[0]) / POINTS_PER_INCH

        try:
            add_picture_to_container(container, io.BytesIO(image_bytes), width_in)
            return
        except Exception as e:
            print(f"Image skip (direct): {type(e).__name__}: {e!r}")

        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            add_picture_to_container(container, buf, width_in)
        except Exception as e2:
            print(f"Image skip (PIL fallback also failed): {type(e2).__name__}: {e2!r}")


def set_cell_background(cell, rgb):
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), '{:02X}{:02X}{:02X}'.format(*rgb))
    cell._tc.get_or_add_tcPr().append(shd)


def set_cell_margins(cell, top=0, start=0, bottom=0, end=0):
    """Values are in twentieths-of-a-point (dxa). 100 ≈ 0.07 inch."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for side, value in (('top', top), ('start', start), ('bottom', bottom), ('end', end)):
        node = OxmlElement(f'w:{side}')
        node.set(qn('w:w'), str(value))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def remove_table_borders(table):
    tblPr = table._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'nil')
        borders.append(el)
    tblPr.append(borders)


def render_two_column_table(document, left_items, right_items, gap_start, gap_end,
                             page_width_pt, usable_width_in, sidebar_color):
    left_width_in = (gap_start / page_width_pt) * usable_width_in
    gutter_width_in = ((gap_end - gap_start) / page_width_pt) * usable_width_in
    right_width_in = usable_width_in - left_width_in - gutter_width_in

    has_gutter = gutter_width_in > 0.02
    num_cols = 3 if has_gutter else 2

    table = document.add_table(rows=1, cols=num_cols)
    table.autofit = False
    remove_table_borders(table)

    if has_gutter:
        table.columns[0].width = Inches(left_width_in)
        table.columns[1].width = Inches(gutter_width_in)
        table.columns[2].width = Inches(right_width_in)
        left_cell, spacer_cell, right_cell = table.rows[0].cells
        left_cell.width = Inches(left_width_in)
        spacer_cell.width = Inches(gutter_width_in)
        right_cell.width = Inches(right_width_in)
        set_cell_margins(spacer_cell, top=0, start=0, bottom=0, end=0)
        spacer_cell.paragraphs[0].text = ""
    else:
        table.columns[0].width = Inches(left_width_in)
        table.columns[1].width = Inches(right_width_in)
        left_cell, right_cell = table.rows[0].cells
        left_cell.width = Inches(left_width_in)
        right_cell.width = Inches(right_width_in)

    set_cell_margins(left_cell, top=100, start=100, bottom=100, end=50)
    set_cell_margins(right_cell, top=100, start=50, bottom=100, end=100)

    if sidebar_color:
        set_cell_background(left_cell, sidebar_color)

    left_cell.paragraphs[0].text = ""
    right_cell.paragraphs[0].text = ""

    for item in left_items:
        if item['kind'] == 'block':
            add_block_to_container(left_cell, item['data'])
    for item in right_items:
        if item['kind'] == 'block':
            add_block_to_container(right_cell, item['data'])


def convert_pdf_to_docx(pdf_path, docx_path):

    pdf = fitz.open(pdf_path)
    document = Document()

    first_page = pdf[0]
    page_width_pt = first_page.rect.width
    page_width_in = page_width_pt / POINTS_PER_INCH
    page_height_in = first_page.rect.height / POINTS_PER_INCH

    left_margin_in, right_margin_in, content_bounds = detect_page_margins(pdf, page_width_pt)

    section = document.sections[0]
    section.page_width = Inches(page_width_in)
    section.page_height = Inches(page_height_in)
    section.left_margin = Inches(left_margin_in)
    section.right_margin = Inches(right_margin_in)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)

    usable_width_in = page_width_in - left_margin_in - right_margin_in

    normal_style = document.styles['Normal']
    normal_style.paragraph_format.space_after = Pt(6)
    normal_style.paragraph_format.space_before = Pt(0)
    normal_style.paragraph_format.line_spacing = 1.0

    enable_hyphenation(document)

    # NEW: detect the background color from the first page and apply it
    # document-wide. Word has no per-page background concept, so this is
    # a best-effort match — fine for single-page or same-background docs,
    # imperfect if different pages use different background colors.
    page_bg_color = get_page_background_color(first_page)
    if page_bg_color:
        print(f"[docx_builder] page background detected: {page_bg_color}")
        set_document_background(document, page_bg_color)

    ocr_pages_used = []

    for page_num, page in enumerate(pdf):
        text_dict, page_used_ocr = get_page_text_dict(page)
        if page_used_ocr:
            ocr_pages_used.append(page_num + 1)
            print(f"OCR used for page {page_num + 1} (no native text layer found)")

        if page_used_ocr:
            found_tables = None
            table_bboxes = []
        else:
            found_tables = page.find_tables()
            table_bboxes = [t.bbox for t in found_tables.tables]

        items = []

        if found_tables:
            for table in found_tables.tables:
                items.append({'bbox': table.bbox, 'kind': 'table', 'data': table.extract(),'table_obj':table})

        for block in text_dict["blocks"]:
            if block["type"] not in (0, 1):
                continue
            block_bbox = block["bbox"]

            if block["type"] == 0:
                is_inside_table = any(
                    rects_overlap_ratio(block_bbox, tb) >= TABLE_OVERLAP_THRESHOLD
                    for tb in table_bboxes
                )
                if is_inside_table:
                    continue
            elif block["type"] == 1 and page_used_ocr:
                continue

            items.append({'bbox': block_bbox, 'kind': 'block', 'data': block})

        narrow_items = [
            i for i in items
            if (i['bbox'][2] - i['bbox'][0]) < FULL_WIDTH_RATIO_THRESHOLD * page_width_pt
        ]
        gap = find_column_gap(narrow_items, page_width_pt)

        if gap:
            gap_start, gap_end = gap
            groups = order_items_for_columns(items, gap_start, gap_end, page_width_pt)

            sidebar_color = get_sidebar_fill_color(page, gap_start)
            print(f"[docx_builder] page {page_num + 1}: sidebar_color detected: {sidebar_color}")

            for item in groups['above']:
                if item['kind'] == 'table':
                    add_table_to_doc(document, item['data'], usable_width_in,page,item.get('table_obj'))

                else:
                    add_block_to_container(document, item['data'], page_width_pt, content_bounds)

            render_two_column_table(document, groups['left'], groups['right'],
                                     gap_start, gap_end, page_width_pt,
                                     usable_width_in, sidebar_color)

            for item in groups['within'] + groups['below']:
                if item['kind'] == 'table':
                 add_table_to_doc(document, item['data'], usable_width_in,page,item.get('table_obj'))
                else:
                    add_block_to_container(document, item['data'], page_width_pt, content_bounds)

            continue  # this page is done — skip the single-column loop below

        # No column gap found -> single-column fallback
        print(f"[docx_builder] page {page_num + 1}: no column gap found, falling back to single-column y-sort")
        items.sort(key=lambda item: item['bbox'][1])

        for item in items:
            if item['kind'] == 'table':
                add_table_to_doc(document, item['data'], usable_width_in,page,item.get('table_obj'))
            else:
                add_block_to_container(document, item['data'], page_width_pt, content_bounds)

    document.save(docx_path)
    pdf.close()
    return ocr_pages_used




def add_picture_to_container(container, image_stream, width_in):
    """Document has add_picture() directly, but a table _Cell doesn't —
    for cells, the image must go through a run instead."""
    if hasattr(container, "add_picture"):
        container.add_picture(image_stream, width=Inches(width_in))
    else:
        paragraph = container.add_paragraph()
        run = paragraph.add_run()
        run.add_picture(image_stream, width=Inches(width_in))