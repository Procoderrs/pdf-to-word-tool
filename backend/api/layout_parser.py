"""
Layout Parser — Stage 3 of the pipeline.
Column-layout detection + text-run helpers (font cleanup, heading
detection, hyphenation, and the missing-space fix).
"""
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt
from collections import Counter
import re
FULL_WIDTH_RATIO_THRESHOLD = 0.6
MIN_GUTTER_WIDTH = 14  # lowered from 20 -> catches tighter gutters (sidebar resumes etc.)
DEFAULT_FONT_NAME = "Calibri"
COLUMN_GAP_STRADDLE_TOLERANCE_PT = 4  # slack when checking if a pair sits on either side of the real column gap


BULLET_CHARS = ('•', '◦', '▪', '‣', '·', '●', '○', '■')

NUMBERED_PATTERN = re.compile(r'^\s*(\d+[.)]|\(\d+\))\s+')

def detect_list_type(text):
    stripped = text.lstrip()
    if stripped and stripped[0] in BULLET_CHARS:
        return 'List Bullet', stripped[1:].lstrip()
    match = NUMBERED_PATTERN.match(stripped)
    if match:
        return 'List Number', stripped[match.end():]
    return None, text

def clean_font_name(raw_font_name):
    if not raw_font_name:
        return DEFAULT_FONT_NAME
    name = raw_font_name
    if '+' in name:
        name = name.split('+', 1)[1]
    for suffix in ('-Bold', '-Italic', '-BoldItalic', '-Regular', ',Bold', ',Italic'):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name or DEFAULT_FONT_NAME


def get_heading_style(max_size_pt):
    if max_size_pt >= 20:
        return {'size': Pt(28), 'bold': True, 'italic': False, 'center': True}
    elif max_size_pt >= 14:
        return {'size': Pt(15), 'bold': False, 'italic': False, 'center': False}
    else:
        return None


def enable_hyphenation(document):
    try:
        settings_element = document.settings.element
        auto_hyphenation = OxmlElement('w:autoHyphenation')
        settings_element.append(auto_hyphenation)
        hyphenation_zone = OxmlElement('w:hyphenationZone')
        hyphenation_zone.set(qn('w:val'), "360")
        settings_element.append(hyphenation_zone)
        consecutive_limit = OxmlElement('w:consecutiveHyphenLimit')
        consecutive_limit.set(qn('w:val'), "2")
        settings_element.append(consecutive_limit)
    except Exception as e:
        print(f"Hyphenation setup skipped: {e}")


def rects_overlap_ratio(block_bbox, table_bbox):
    bx0, by0, bx1, by1 = block_bbox
    tx0, ty0, tx1, ty1 = table_bbox
    ix0, iy0 = max(bx0, tx0), max(by0, ty0)
    ix1, iy1 = min(bx1, tx1), min(by1, ty1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    intersection_area = (ix1 - ix0) * (iy1 - iy0)
    block_area = (bx1 - bx0) * (by1 - by0)
    if block_area == 0:
        return 0.0
    return intersection_area / block_area


# --- FIX #1: missing spaces between words ---
# ("Results-drivenmarketingleaderwith10+year...")
# PyMuPDF sometimes splits justified/proportionally-spaced text into
# multiple spans WITHOUT a literal space character between them — the
# space only exists as a horizontal gap on the page, not as a character.
# Directly concatenating span["text"] (old code) loses that gap. This
# checks the gap and tells the caller to insert a space when needed.
def spans_need_space(prev_span, next_span):
    if not prev_span:
        return False
    prev_text = prev_span["text"]
    if not prev_text or prev_text.endswith(" "):
        return False
    gap = next_span["bbox"][0] - prev_span["bbox"][2]
    avg_char_width = prev_span["size"] * 0.25
    return gap > avg_char_width


# --- Column detection (2-column layout) ---
def find_column_gap(narrow_items, page_width):
    intervals = sorted((item['bbox'][0], item['bbox'][2]) for item in narrow_items)
    if not intervals:
        return None

    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    if len(merged) < 2:
        return None

    gaps = []
    for i in range(len(merged) - 1):
        gap_start = merged[i][1]
        gap_end = merged[i + 1][0]
        gaps.append((gap_end - gap_start, gap_start, gap_end))

    gaps.sort(reverse=True)
    widest_width, gap_start, gap_end = gaps[0]
    gap_center_ratio = ((gap_start + gap_end) / 2) / page_width

    # require real support on BOTH sides — a single item on one side
    # (e.g. a right-aligned date next to a section heading) isn't a
    # genuine 2-column layout, just incidental right-alignment.
    left_count = sum(1 for item in narrow_items if item['bbox'][2] <= gap_start)
    right_count = sum(1 for item in narrow_items if item['bbox'][0] >= gap_end)
    print(f"[layout_parser] gap candidate: width={widest_width:.1f}pt center_ratio={gap_center_ratio:.2f} left_count={left_count} right_count={right_count}")

    MIN_ITEMS_PER_SIDE = 2
    if left_count < MIN_ITEMS_PER_SIDE or right_count < MIN_ITEMS_PER_SIDE:
        return None

    if widest_width >= MIN_GUTTER_WIDTH and 0.15 <= gap_center_ratio <= 0.85:
        return (gap_start, gap_end)
    return None

def assign_to_column(bbox, gap_start, gap_end, page_width):
    bx0, bx1 = bbox[0], bbox[2]
    if (bx1 - bx0) >= FULL_WIDTH_RATIO_THRESHOLD * page_width:
        return 'full'
    if bx1 <= gap_start:
        return 'left'
    elif bx0 >= gap_end:
        return 'right'
    else:
        return 'full'


def order_items_for_columns(items, gap_start, gap_end, page_width):
    left_items, right_items, full_items = [], [], []
    for item in items:
        column = assign_to_column(item['bbox'], gap_start, gap_end, page_width)
        if column == 'left':
            left_items.append(item)
        elif column == 'right':
            right_items.append(item)
        else:
            full_items.append(item)

    left_items.sort(key=lambda i: i['bbox'][1])
    right_items.sort(key=lambda i: i['bbox'][1])
    full_items.sort(key=lambda i: i['bbox'][1])

    left_top = left_items[0]['bbox'][1] if left_items else None
    right_top = right_items[0]['bbox'][1] if right_items else None
    tops = [t for t in (left_top, right_top) if t is not None]
    # FIX: use the LATER-starting column's top (max, not min). A
    # full-width heading (e.g. "AUSTIN") that sits above whichever
    # column starts later — even though the OTHER column (like a photo
    # box) already starts at y=0 — should count as "above" and print
    # before the table, not get stranded in "within" (rendered after
    # the whole table, at the very end of the page).
    column_top_y = max(tops) if tops else 0

    left_bottom = left_items[-1]['bbox'][3] if left_items else None
    right_bottom = right_items[-1]['bbox'][3] if right_items else None
    bottoms = [b for b in (left_bottom, right_bottom) if b is not None]
    column_bottom_y = max(bottoms) if bottoms else 0

    above = [i for i in full_items if i['bbox'][1] < column_top_y]
    below = [i for i in full_items if i['bbox'][1] >= column_bottom_y]
    within = [i for i in full_items if i not in above and i not in below]

    return {
        'above': above,
        'left': left_items,
        'within': within,
        'right': right_items,
        'below': below,
    }


# NEW: find the sidebar's background fill color from vector drawings
def get_sidebar_fill_color(page, gap_start):
    page_height = page.rect.height
    best_fill, best_area = None, 0
    for d in page.get_drawings():
        if not d.get("fill"):
            continue
        for item in d["items"]:
            if item[0] != "re":
                continue
            x0, y0, x1, y1 = item[1]
            # CHANGED: check x0 instead of x1 — sidebar box can extend
            # slightly past the text gutter, but it must START at/near
            # the left page edge, before the gutter begins.
            if x0 > gap_start:
                continue
            height = y1 - y0
            if height < page_height * 0.5:
                continue
            area = (x1 - x0) * height
            if area > best_area:
                best_area, best_fill = area, d["fill"]
    if best_fill:
        r, g, b = [int(c * 255) for c in best_fill]
        return (r, g, b)
    return None



def set_run_font(run, font_name):
    """Sets the font name on ALL of Word's font slots (ascii, hAnsi,
    eastAsia, complex-script) — python-docx's run.font.name only sets
    ascii/hAnsi by default, which can cause inconsistent rendering."""
    run.font.name = font_name
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), font_name)
    rFonts.set(qn('w:hAnsi'), font_name)
    rFonts.set(qn('w:eastAsia'), font_name)
    rFonts.set(qn('w:cs'), font_name)


    # NEW: detect a full-page background fill color (distinct from sidebar detection —
# this looks for a rectangle covering most/all of the page, not just one column)

def get_page_background_color(page):
    """Renders the page at low resolution and samples its four corners
    to find the actual visual background color — more reliable than
    reasoning about overlapping vector rectangles, which can pick the
    wrong layer when multiple full-page rects are stacked."""
    pix = page.get_pixmap(dpi=72)
    margin = 5  # avoid sampling right on a border line/stroke
    sample_points = [
        (margin, margin),
        (pix.width - margin, margin),
        (margin, pix.height - margin),
        (pix.width - margin, pix.height - margin),
    ]
    colors = []
    for x, y in sample_points:
        try:
            colors.append(pix.pixel(x, y))
        except Exception:
            continue
    if not colors:
        return None

    most_common_color, count = Counter(colors).most_common(1)[0]
    # require at least 3 of 4 corners to agree — otherwise it's probably
    # not a uniform background (e.g. an image bleeds to the edge)
    if count < 3:
        return None
    return tuple(most_common_color[:3])  # drop alpha if present


def get_horizontal_lines(page):
    """Detects horizontal ruling lines (e.g. underlines below section
    headings) drawn as vector line segments in the PDF."""
    lines = []
    seen = set()
    for d in page.get_drawings():
        width = d.get("width")
        for item in d["items"]:
            if item[0] != "l":
                continue
            p1, p2 = item[1], item[2]
            if abs(p1.y - p2.y) > 0.5:
                continue
            y = round((p1.y + p2.y) / 2, 1)
            x0, x1 = sorted([p1.x, p2.x])
            key = (y, round(x0), round(x1))
            if key in seen:
                continue
            seen.add(key)
            lines.append((y, x0, x1, width))
    return lines



def split_line_by_large_gap(line):
    """Detects if a line has two clusters separated by a gap much wider
    than normal word-spacing (e.g. a heading + right-aligned links on
    the same PDF line). Threshold is derived from the line's own font
    size, not a fixed value. Returns (left_spans, right_spans) or
    (all_spans, None) if no such split exists."""
    spans = [s for s in line["spans"] if s["text"].strip()]
    if len(spans) < 2:
        return spans, None

    avg_size = sum(s["size"] for s in spans) / len(spans)
    threshold = avg_size * 3  # normal word gaps are well under 1 char-width

    best_gap, best_idx = 0, None
    for i in range(1, len(spans)):
        gap = spans[i]["bbox"][0] - spans[i - 1]["bbox"][2]
        if gap > best_gap:
            best_gap, best_idx = gap, i

    if best_gap > threshold:
        return spans[:best_idx], spans[best_idx:]
    return spans, None



def merge_lines_by_y(lines_a, lines_b):
    combined = list(lines_a)
    for lb in lines_b:
        matched = False
        for i, la in enumerate(combined):
            if abs(la["bbox"][1] - lb["bbox"][1]) < 3:
                new_bbox = (
                    min(la["bbox"][0], lb["bbox"][0]),
                    min(la["bbox"][1], lb["bbox"][1]),
                    max(la["bbox"][2], lb["bbox"][2]),
                    max(la["bbox"][3], lb["bbox"][3]),
                )
                combined[i] = {**la, "spans": la["spans"] + lb["spans"], "bbox": new_bbox}
                matched = True
                break
        if not matched:
            combined.append(lb)
    combined.sort(key=lambda l: l["bbox"][1])
    return combined


def _pair_straddles_column_gap(left_bbox, right_bbox, column_gap):
    """FIX (root cause of the recipe/newsletter/sidebar-CV regression):
    a real two-column layout ALSO looks like "two blocks, same row,
    gap in between" — a numbered step in the left column and another
    numbered step in the right column, a sidebar heading and a main-
    column heading, an image column and a text column. Blind same-row
    merging (merge_same_line_blocks, find_row_pairs) can't tell that
    apart from a genuine single-line split (job title + right-aligned
    date), so it must be told where the real column gap is and skip
    any pair that sits cleanly on opposite sides of it.
    """
    if not column_gap:
        return False
    gap_start, gap_end = column_gap
    return (
        left_bbox[2] <= gap_start + COLUMN_GAP_STRADDLE_TOLERANCE_PT
        and right_bbox[0] >= gap_end - COLUMN_GAP_STRADDLE_TOLERANCE_PT
    )


def merge_same_line_blocks(items, column_gap=None):
    """PyMuPDF sometimes splits text that visually sits on the same line
    (e.g. a job title and a right-aligned date range) into two separate
    blocks. Detect blocks whose vertical ranges overlap heavily and
    merge them into one, so they render as a single line with a right
    tab-stop, instead of ending up on separate lines.

    column_gap: the real 2-column gap already detected on this page
    BEFORE any same-line merging (see convert_pdf_to_docx). Any
    candidate pair straddling that gap is left un-merged — see
    _pair_straddles_column_gap.
    """
    block_items = [i for i in items if i['kind'] == 'block' and i['data']['type'] == 0]
    other_items = [i for i in items if not (i['kind'] == 'block' and i['data']['type'] == 0)]

    used = set()
    merged = []
    for idx, item in enumerate(block_items):
        if idx in used:
            continue
        bbox = item['bbox']
        partner = None
        for jdx in range(idx + 1, len(block_items)):
            if jdx in used:
                continue
            obbox = block_items[jdx]['bbox']
            overlap = min(bbox[3], obbox[3]) - max(bbox[1], obbox[1])
            min_height = min(bbox[3] - bbox[1], obbox[3] - obbox[1])
            if min_height > 0 and overlap / min_height > 0.5:
                # NEW GUARD: skip if this pair is really two separate
                # columns, not a same-line split.
                left_bbox, right_bbox = (
                    (bbox, obbox) if bbox[0] <= obbox[0] else (obbox, bbox)
                )
                if _pair_straddles_column_gap(left_bbox, right_bbox, column_gap):
                    continue
                partner = jdx
                break
        if partner is not None:
            other = block_items[partner]
            used.add(partner)
            left, right = (item, other) if item['bbox'][0] <= other['bbox'][0] else (other, item)
            merged_bbox = (
                min(left['bbox'][0], right['bbox'][0]),
                min(left['bbox'][1], right['bbox'][1]),
                max(left['bbox'][2], right['bbox'][2]),
                max(left['bbox'][3], right['bbox'][3]),
            )
            merged_data = dict(left['data'])
            merged_data['lines'] = merge_lines_by_y(left['data']['lines'], right['data']['lines'])
            merged.append({'bbox': merged_bbox, 'kind': 'block', 'data': merged_data})
        else:
            merged.append(item)
        used.add(idx)

    return merged + other_items



def merge_overlapping_lines(lines):
    """PyMuPDF sometimes represents two visually-same-row text runs
    (e.g. a title and a right-aligned link list) as two separate 'line'
    entries with heavily overlapping y-ranges, instead of as multiple
    spans within one line. Merge such lines together first, so the
    same-line gap/tab-stop logic can see all spans on that row.

    NOTE: this only merges LINES WITHIN A SINGLE BLOCK — it never
    crosses a block boundary, so it can't straddle a real column gap
    the way merge_same_line_blocks / find_row_pairs could. No guard
    needed here."""
    if not lines:
        return lines
    merged = [dict(lines[0])]
    merged[-1]["spans"] = list(lines[0]["spans"])
    for line in lines[1:]:
        prev = merged[-1]
        top = max(prev["bbox"][1], line["bbox"][1])
        bottom = min(prev["bbox"][3], line["bbox"][3])
        overlap = bottom - top
        min_height = min(prev["bbox"][3] - prev["bbox"][1], line["bbox"][3] - line["bbox"][1])
        if min_height > 0 and overlap / min_height > 0.4:
            prev["spans"] = prev["spans"] + line["spans"]
            prev["bbox"] = (
                min(prev["bbox"][0], line["bbox"][0]),
                min(prev["bbox"][1], line["bbox"][1]),
                max(prev["bbox"][2], line["bbox"][2]),
                max(prev["bbox"][3], line["bbox"][3]),
            )
        else:
            merged.append(dict(line))
            merged[-1]["spans"] = list(line["spans"])
    return merged