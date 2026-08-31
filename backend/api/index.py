from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import tempfile
import os
import uuid
import io

from pdf_analyzer import inspect_pdf
from docx_builder import convert_pdf_to_docx

app = Flask(__name__)
CORS(app)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@app.route('/', methods=['GET'])
def index():
    return jsonify({'message': 'API is working'})


@app.route('/api/convert', methods=['POST'])
def convert_pdf_to_word():
    if 'pdfFile' not in request.files:
        return jsonify({'error': 'Please select a valid PDF file.'}), 400

    file = request.files['pdfFile']

    if file.filename == '':
        return jsonify({'error': 'Please select a valid PDF file.'}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are allowed.'}), 400

    file_bytes = file.read()

    if len(file_bytes) == 0:
        return jsonify({'error': 'The uploaded file is empty or corrupted.'}), 400

    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify({'error': 'File exceeds the 50MB limit.'}), 400

    unique_id = uuid.uuid4().hex
    input_path = os.path.join(tempfile.gettempdir(), f'input_{unique_id}.pdf')
    output_path = os.path.join(tempfile.gettempdir(), f'output_{unique_id}.docx')

    try:
        with open(input_path, 'wb') as f:
            f.write(file_bytes)

        try:
            info = inspect_pdf(input_path)
        except Exception as e:
            print('PDF inspection error:', str(e))
            return jsonify({'error': 'This file could not be read as a valid PDF.'}), 400

        if info['encrypted']:
            return jsonify({
                'error': 'This PDF is password-protected. Please remove the password and try again.'
            }), 422

        ocr_pages_used = convert_pdf_to_docx(input_path, output_path)

        if not os.path.exists(output_path):
            return jsonify({'error': 'Conversion failed. Please try a different file.'}), 500

        with open(output_path, 'rb') as f:
            docx_bytes = f.read()

        original_name = os.path.splitext(file.filename)[0]

        response = send_file(
            io.BytesIO(docx_bytes),
            as_attachment=True,
            download_name=f'{original_name}.docx',
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

        if ocr_pages_used:
            response.headers['X-OCR-Pages'] = ','.join(str(p) for p in ocr_pages_used)

        return response

    except Exception as e:
        print('Conversion error:', str(e))
        return jsonify({'error': 'Conversion failed. Please try a different file.'}), 500

    finally:
        for path in (input_path, output_path):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(debug=True, port=5001)