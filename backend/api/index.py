from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

# pdfplumber:
# PDF se text aur tables extract karne ke liye use ho raha hai.
import pdfplumber

# python-docx:
# Word (.docx) document create aur modify karne ke liye.
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import (
    WD_TABLE_ALIGNMENT,
    WD_CELL_VERTICAL_ALIGNMENT
)

# Word table cell ke borders customize karne ke liye.
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

import tempfile
import os
import uuid
import io

# PyMuPDF:
# PDF inspect karne aur PDF pages ko high-resolution images
# mein render karne ke liye.
import fitz


# ============================================================
# FLASK APP SETUP
# ============================================================

app = Flask(__name__)

# Frontend ko different port/domain se backend API call
# karne ki permission deta hai.
CORS(app)

# Maximum uploaded PDF size = 50 MB
MAX_FILE_SIZE = 50 * 1024 * 1024


# ============================================================
# HOME / API TEST ROUTE
# ============================================================

@app.route("/", methods=["GET"])
def index():
    """
    Simple route to check whether Flask API is running.
    """

    return jsonify({
        "message": "API is working"
    })


# ============================================================
# PDF INSPECTION
# ============================================================

def inspect_pdf(path):
    """
    PDF ko conversion se pehle inspect karta hai.

    Check karta hai:

    1. PDF password protected / encrypted hai ya nahi
    2. PDF mein selectable text available hai ya nahi

    Returns:
        {
            "encrypted": True/False,
            "has_text": True/False
        }
    """

    # PDF ko PyMuPDF se open karte hain.
    doc = fitz.open(path)

    try:

        # Check whether PDF encrypted/password protected hai.
        encrypted = doc.is_encrypted

        # Initially assume karte hain ke text nahi hai.
        has_text = False

        # Agar PDF encrypted nahi hai to pages ka text check karenge.
        if not encrypted:

            for page in doc:

                # Agar kisi page par text mil jaye
                # to PDF ko text-based PDF consider karenge.
                if page.get_text().strip():

                    has_text = True
                    break

        return {
            "encrypted": encrypted,
            "has_text": has_text
        }

    finally:

        # PDF document close karna zaroori hai.
        doc.close()


# ============================================================
# WORD TABLE BORDERS
# ============================================================

def set_cell_borders(cell):
    """
    Word table ke har cell par borders apply karta hai.

    Isse extracted PDF table Word mein
    proper grid/borders ke saath show hoti hai.
    """

    # Word table cell ka internal XML element.
    tc = cell._tc

    # Cell properties.
    tcPr = tc.get_or_add_tcPr()

    # Existing borders find karne ki koshish.
    tcBorders = tcPr.first_child_found_in(
        "w:tcBorders"
    )

    # Agar borders already nahi hain
    # to new borders element create karte hain.
    if tcBorders is None:

        tcBorders = OxmlElement(
            "w:tcBorders"
        )

        tcPr.append(tcBorders)

    # Cell ki different sides:
    # top, left, bottom, right etc.
    for edge in (
        "top",
        "left",
        "bottom",
        "right",
        "insideH",
        "insideV"
    ):

        tag = "w:" + edge

        # Existing border element find karo.
        element = tcBorders.find(
            qn(tag)
        )

        # Agar nahi mila to new element create karo.
        if element is None:

            element = OxmlElement(tag)

            tcBorders.append(element)

        # Border ko visible banate hain.
        element.set(
            qn("w:val"),
            "single"
        )

        # Border thickness.
        element.set(
            qn("w:sz"),
            "4"
        )

        # Border ke around spacing.
        element.set(
            qn("w:space"),
            "0"
        )

        # Border color black.
        element.set(
            qn("w:color"),
            "000000"
        )


# ============================================================
# WORD TABLE CELL TEXT
# ============================================================

def set_cell_text(
    cell,
    text,
    bold=False
):
    """
    Word table ke individual cell mein text add karta hai.

    First row ke liye bold=True pass kiya ja sakta hai,
    taake header bold ho.
    """

    # Existing cell content clear karo.
    cell.text = ""

    # Cell ka first paragraph.
    paragraph = cell.paragraphs[0]

    # Text left aligned.
    paragraph.alignment = (
        WD_ALIGN_PARAGRAPH.LEFT
    )

    # Cell mein text add karo.
    run = paragraph.add_run(
        str(text)
        if text is not None
        else ""
    )

    # Font size.
    run.font.size = Pt(10)

    # Header ke liye bold.
    run.bold = bold

    # Text vertically center.
    cell.vertical_alignment = (
        WD_CELL_VERTICAL_ALIGNMENT.CENTER
    )


# ============================================================
# PDF TABLE → WORD TABLE
# ============================================================

def add_table_to_doc(
    document,
    table_data
):
    """
    pdfplumber se extracted table ko
    editable Word table mein convert karta hai.

    PDF table:
        rows + columns

            ↓

    Word table:
        editable rows + columns
    """

    # Agar table empty hai to kuch nahi karna.
    if not table_data:
        return

    # --------------------------------------------------------
    # EMPTY ROWS REMOVE KARNA
    # --------------------------------------------------------

    cleaned_rows = []

    for row in table_data:

        # Invalid row skip.
        if row is None:
            continue

        # Har cell ko string mein convert karte hain.
        # None values ko empty string bana dete hain.
        cleaned_row = [
            ""
            if cell is None
            else str(cell).strip()
            for cell in row
        ]

        # Completely empty row skip.
        if any(cleaned_row):

            cleaned_rows.append(
                cleaned_row
            )

    # Agar cleaning ke baad table empty hai.
    if not cleaned_rows:
        return

    # --------------------------------------------------------
    # MAXIMUM COLUMNS FIND KARNA
    # --------------------------------------------------------

    # Table ki kisi bhi row mein maximum columns
    # calculate karte hain.
    max_columns = max(
        len(row)
        for row in cleaned_rows
    )

    # --------------------------------------------------------
    # ROWS KO SAME NUMBER OF COLUMNS DENA
    # --------------------------------------------------------

    normalized_rows = []

    for row in cleaned_rows:

        # Agar kisi row mein columns kam hain
        # to missing cells empty bana do.
        row = row + [""] * (
            max_columns - len(row)
        )

        normalized_rows.append(
            row
        )

    # --------------------------------------------------------
    # WORD TABLE CREATE KARNA
    # --------------------------------------------------------

    word_table = document.add_table(
        rows=len(normalized_rows),
        cols=max_columns
    )

    # Table center align.
    word_table.alignment = (
        WD_TABLE_ALIGNMENT.CENTER
    )

    # Word ka built-in table grid style.
    word_table.style = "Table Grid"

    # --------------------------------------------------------
    # TABLE CELLS FILL KARNA
    # --------------------------------------------------------

    for row_index, row in enumerate(
        normalized_rows
    ):

        for col_index, value in enumerate(
            row
        ):

            # Specific cell select karo.
            cell = word_table.cell(
                row_index,
                col_index
            )

            # First row ko header treat kar rahe hain.
            is_header = (
                row_index == 0
            )

            # Cell mein text add karo.
            set_cell_text(
                cell,
                value,
                bold=is_header
            )

            # Cell borders add karo.
            set_cell_borders(
                cell
            )

    # Table ke baad thora spacing.
    paragraph = document.add_paragraph()

    paragraph.paragraph_format.space_after = (
        Pt(6)
    )


# ============================================================
# TABLE EXTRACTION
# ============================================================

def extract_page_content(page):
    """
    pdfplumber ke through current PDF page se
    tables extract karta hai.

    Returns:
        List of detected tables.
    """

    tables = page.extract_tables()

    return tables


# ============================================================
# PDF PAGE / GRAPH RENDERING
# ============================================================

def add_rendered_page_to_doc(
    document,
    fitz_page,
    page_number
):
    """"
    PDF ke complete page ko high-resolution image
    mein render karke Word document mein insert karta hai.

    Ye approach especially useful hai for:

    - Graphs
    - Charts
    - Vector drawings
    - Complex visual elements
    - PDF layouts jo normal text extraction se
      properly preserve nahi hote

    Important:
    Ye complete PDF page ko image banata hai,
    sirf graph ko nahi.
    """

    # Temporary image ka path initially None.
    image_path = None

    try:

        # ----------------------------------------------------
        # PDF PAGE KO 300 DPI PAR RENDER KARNA
        # ----------------------------------------------------

        # 300 DPI high-resolution image generate karega.
        pix = fitz_page.get_pixmap(
            dpi=300,
            alpha=False
        )

        # ----------------------------------------------------
        # TEMPORARY IMAGE PATH
        # ----------------------------------------------------

        image_path = os.path.join(
            tempfile.gettempdir(),
            (
                f"rendered_page_"
                f"{uuid.uuid4().hex}.png"
            )
        )

        # ----------------------------------------------------
        # RENDERED PAGE KO PNG MEIN SAVE KARNA
        # ----------------------------------------------------

        pix.save(
            image_path
        )

        # ----------------------------------------------------
        # WORD DOCUMENT MEIN IMAGE ADD KARNA
        # ----------------------------------------------------

        paragraph = document.add_paragraph()

        # Image center aligned.
        paragraph.alignment = (
            WD_ALIGN_PARAGRAPH.CENTER
        )

        # Paragraph mein image add karne ke liye run.
        run = paragraph.add_run()

        # Rendered PDF page ko Word mein insert.
        #
        # 6.5 inches width ka matlab image
        # Word page ke andar fit hogi.
        run.add_picture(
            image_path,
            width=Inches(6.5)
        )

        print(
            f"Rendered page {page_number} "
            f"added to Word."
        )

        # Successfully one page rendered.
        return 1

    except Exception as e:

        print(
            f"Graph/page rendering error "
            f"on page {page_number}:",
            str(e)
        )

        return 0

    finally:

        # ----------------------------------------------------
        # TEMPORARY PNG DELETE KARNA
        # ----------------------------------------------------

        if (
            image_path
            and os.path.exists(image_path)
        ):

            try:

                os.remove(
                    image_path
                )

            except Exception:
                pass


# ============================================================
# MAIN PDF → DOCX CONVERSION FUNCTION
# ============================================================

def create_docx_from_pdf(
    input_path,
    output_path
):
    """
    Main conversion function.

    PDF ko DOCX mein convert karta hai.

    Current implementation mein:

    1. Normal text
       → pdfplumber se extract

    2. Tables
       → pdfplumber se detect/extract
       → python-docx se editable Word tables

    3. Graphs / charts / complex visuals
       → PyMuPDF se complete page 300 DPI par render
       → Word mein image ke form mein insert

    Returns:
        total_tables
        total_rendered_pages
    """

    # --------------------------------------------------------
    # NEW WORD DOCUMENT CREATE
    # --------------------------------------------------------

    document = Document()

    # --------------------------------------------------------
    # WORD DOCUMENT MARGINS
    # --------------------------------------------------------

    section = document.sections[0]

    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.7)
    section.right_margin = Inches(0.7)

    # Counters for logging and response headers.
    total_tables = 0
    total_rendered_pages = 0

    # --------------------------------------------------------
    # PDF KO PYMUPDF SE OPEN KARNA
    # --------------------------------------------------------

    fitz_doc = fitz.open(
        input_path
    )

    try:

        # ----------------------------------------------------
        # SAME PDF KO PDFPLUMBER SE OPEN KARNA
        # ----------------------------------------------------

        with pdfplumber.open(
            input_path
        ) as pdf:

            # Har PDF page process hoga.
            for page_number, page in enumerate(
                pdf.pages,
                start=1
            ):

                print(
                    f"\nProcessing page "
                    f"{page_number}..."
                )

                # =================================================
                # STEP 1: TABLE EXTRACTION
                # =================================================

                tables = extract_page_content(
                    page
                )

                print(
                    f"Page {page_number}: "
                    f"{len(tables)} table(s) found"
                )

                # Agar tables mil gayi hain.
                if tables:

                    # Har detected table ko process karo.
                    for table_index, table in enumerate(
                        tables,
                        start=1
                    ):

                        print(
                            f"Adding table "
                            f"{table_index} "
                            f"from page "
                            f"{page_number}"
                        )

                        # PDF table ko Word table mein convert.
                        add_table_to_doc(
                            document,
                            table
                        )

                        total_tables += 1

                # =================================================
                # STEP 2: NORMAL TEXT EXTRACTION
                # =================================================

                # Current page ka selectable text extract karo.
                text = page.extract_text()

                # Agar text available hai.
                if text:

                    # New Word paragraph.
                    paragraph = (
                        document.add_paragraph()
                    )

                    paragraph.paragraph_format.space_after = (
                        Pt(6)
                    )

                    # Extracted PDF text Word mein add.
                    run = paragraph.add_run(
                        text
                    )

                    # Font size.
                    run.font.size = Pt(10)

                # =================================================
                # STEP 3: GRAPH / CHART / COMPLEX VISUAL HANDLING
                # =================================================

                # pdfplumber ka page use nahi karna.
                # Yahan same page ka PyMuPDF version use hoga.
                fitz_page = fitz_doc[
                    page_number - 1
                ]

                # Complete PDF page ko 300 DPI image
                # mein render karke Word mein insert karo.
                total_rendered_pages += (
                    add_rendered_page_to_doc(
                        document,
                        fitz_page,
                        page_number
                    )
                )

                # =================================================
                # STEP 4: PAGE BREAK
                # =================================================

                # Last page ke baad page break ki zarurat nahi.
                if page_number < len(
                    pdf.pages
                ):

                    document.add_page_break()

    finally:

        # --------------------------------------------------------
        # PDF CLOSE
        # --------------------------------------------------------

        fitz_doc.close()

    # ------------------------------------------------------------
    # FINAL WORD FILE SAVE
    # ------------------------------------------------------------

    document.save(
        output_path
    )

    # ------------------------------------------------------------
    # CONVERSION LOG
    # ------------------------------------------------------------

    print(
        "\n================================"
    )

    print(
        "Conversion completed."
    )

    print(
        f"Total tables: {total_tables}"
    )

    print(
        f"Total rendered pages: "
        f"{total_rendered_pages}"
    )

    print(
        "================================\n"
    )

    return (
        total_tables,
        total_rendered_pages
    )


# ============================================================
# PDF → WORD API ENDPOINT
# ============================================================

@app.route(
    "/api/convert",
    methods=["POST"]
)
def convert_pdf_to_word():
    """
    Frontend se PDF receive karta hai
    aur converted DOCX return karta hai.
    """

    # --------------------------------------------------------
    # STEP 1: CHECK FILE FIELD
    # --------------------------------------------------------

    if "pdfFile" not in request.files:

        return jsonify({
            "error": (
                "Please select a valid PDF file."
            )
        }), 400

    # Uploaded file.
    file = request.files[
        "pdfFile"
    ]

    # --------------------------------------------------------
    # STEP 2: CHECK EMPTY FILE NAME
    # --------------------------------------------------------

    if file.filename == "":

        return jsonify({
            "error": (
                "Please select a valid PDF file."
            )
        }), 400

    # --------------------------------------------------------
    # STEP 3: CHECK PDF EXTENSION
    # --------------------------------------------------------

    if not file.filename.lower().endswith(
        ".pdf"
    ):

        return jsonify({
            "error": (
                "Only PDF files are allowed."
            )
        }), 400

    # --------------------------------------------------------
    # STEP 4: READ FILE
    # --------------------------------------------------------

    file_bytes = file.read()

    # Empty/corrupt upload check.
    if len(file_bytes) == 0:

        return jsonify({
            "error": (
                "The uploaded file is empty "
                "or corrupted."
            )
        }), 400

    # --------------------------------------------------------
    # STEP 5: FILE SIZE CHECK
    # --------------------------------------------------------

    if len(file_bytes) > MAX_FILE_SIZE:

        return jsonify({
            "error": (
                "File exceeds the 50MB limit."
            )
        }), 400

    # --------------------------------------------------------
    # STEP 6: CREATE UNIQUE TEMPORARY FILE PATHS
    # --------------------------------------------------------

    unique_id = uuid.uuid4().hex

    # Uploaded PDF ka temporary path.
    input_path = os.path.join(
        tempfile.gettempdir(),
        f"input_{unique_id}.pdf"
    )

    # Converted DOCX ka temporary path.
    output_path = os.path.join(
        tempfile.gettempdir(),
        f"output_{unique_id}.docx"
    )

    try:

        # ----------------------------------------------------
        # STEP 7: SAVE UPLOADED PDF
        # ----------------------------------------------------

        with open(
            input_path,
            "wb"
        ) as f:

            f.write(
                file_bytes
            )

        # ----------------------------------------------------
        # STEP 8: INSPECT PDF
        # ----------------------------------------------------

        try:

            info = inspect_pdf(
                input_path
            )

        except Exception as e:

            print(
                "PDF inspection error:",
                str(e)
            )

            return jsonify({
                "error": (
                    "This file could not be "
                    "read as a valid PDF."
                )
            }), 400

        # ----------------------------------------------------
        # STEP 9: PASSWORD PROTECTED PDF CHECK
        # ----------------------------------------------------

        if info["encrypted"]:

            return jsonify({
                "error": (
                    "This PDF is password-protected. "
                    "Please remove the password and "
                    "try again."
                )
            }), 422

        # ----------------------------------------------------
        # STEP 10: IMAGE-ONLY PDF CHECK
        # ----------------------------------------------------

        # Agar PDF mein selectable text nahi hai
        # to ye image-only PDF ho sakti hai.
        image_only_warning = (
            not info["has_text"]
        )

        # ----------------------------------------------------
        # STEP 11: PDF → DOCX CONVERSION
        # ----------------------------------------------------

        (
            total_tables,
            total_rendered_pages
        ) = create_docx_from_pdf(
            input_path,
            output_path
        )

        # ----------------------------------------------------
        # STEP 12: CHECK GENERATED DOCX
        # ----------------------------------------------------

        if not os.path.exists(
            output_path
        ):

            return jsonify({
                "error": (
                    "Conversion failed. "
                    "Please try a different file."
                )
            }), 500

        # ----------------------------------------------------
        # STEP 13: READ GENERATED DOCX
        # ----------------------------------------------------

        with open(
            output_path,
            "rb"
        ) as f:

            docx_bytes = f.read()

        # ----------------------------------------------------
        # STEP 14: CREATE OUTPUT FILE NAME
        # ----------------------------------------------------

        # Example:
        # report.pdf
        #
        # becomes:
        # report.docx

        original_name = os.path.splitext(
            file.filename
        )[0]

        # ----------------------------------------------------
        # STEP 15: SEND DOCX TO FRONTEND
        # ----------------------------------------------------

        response = send_file(
            io.BytesIO(
                docx_bytes
            ),
            as_attachment=True,
            download_name=(
                f"{original_name}.docx"
            ),
            mimetype=(
                "application/vnd.openxmlformats-"
                "officedocument.wordprocessingml.document"
            )
        )

        # ----------------------------------------------------
        # STEP 16: ADD INFORMATION TO RESPONSE HEADERS
        # ----------------------------------------------------

        # Frontend/debugging ke liye useful.
        response.headers[
            "X-Tables-Found"
        ] = str(
            total_tables
        )

        response.headers[
            "X-Rendered-Pages"
        ] = str(
            total_rendered_pages
        )

        # Agar PDF image-only hai to frontend ko
        # conversion mode bataya ja sakta hai.
        if image_only_warning:

            response.headers[
                "X-Conversion-Mode"
            ] = "image-only"

        return response

    # --------------------------------------------------------
    # ERROR HANDLING
    # --------------------------------------------------------

    except Exception as e:

        print(
            "Conversion error:",
            str(e)
        )

        return jsonify({
            "error": (
                "Conversion failed. "
                "Please try a different file."
            )
        }), 500

    # --------------------------------------------------------
    # TEMPORARY FILE CLEANUP
    # --------------------------------------------------------

    finally:

        # Conversion ke baad temporary PDF aur DOCX
        # delete kar diye jate hain.
        for path in (
            input_path,
            output_path
        ):

            if os.path.exists(
                path
            ):

                try:

                    os.remove(
                        path
                    )

                except Exception:
                    pass


# ============================================================
# HEALTH CHECK ROUTE
# ============================================================

@app.route(
    "/api/health",
    methods=["GET"]
)
def health():
    """
    Backend/server health check.
    """

    return jsonify({
        "status": "ok"
    })


# ============================================================
# START FLASK SERVER
# ============================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        port=5001
    )