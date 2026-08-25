/* import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials:true,
});

VITE_PYTHON_API_URL=https://pdf-to-word-tool-psi.vercel.app
VITE_PYTHON_API_URL=http://localhost:5001
export default api; */


import axios from "axios";

// Points directly to the Python Flask API (deployed separately on Vercel) —
// Node.js is no longer in this request path.
const pythonApi = axios.create({
  baseURL: import.meta.env.VITE_PYTHON_API_URL,
});

export default pythonApi;



/* 


from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from pdf2docx import Converter
import fitz  # PyMuPDF — already installed as a pdf2docx dependency
import tempfile
import os
import uuid
import io

app = Flask(__name__)
CORS(app)  # allows the frontend (different port/domain) to call this API

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@app.route('/', methods=['GET'])
def index():
    return jsonify({'message': 'API is working'})


def inspect_pdf(path):
    """
    Quick pre-check before running the (slower) full conversion.
    Returns a dict: { 'encrypted': bool, 'has_text': bool }
    """
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

        image_only_warning = not info['has_text']

        cv = Converter(input_path)
        cv.convert(output_path)
        cv.close()

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

        if image_only_warning:
            response.headers['X-Conversion-Mode'] = 'image-only'

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


*/