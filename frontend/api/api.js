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


cv = Converter(input_path)
        cv.convert(
            output_path,
            # --- Testing these for layout-misalignment issues ---
            line_break_width_ratio=0.3,           # default 0.5 — lower catches line-breaks earlier
            new_paragraph_free_space_ratio=0.75,  # default 0.85 — lower merges fewer lines into one paragraph
            lines_left_aligned_threshold=2.0,     # default 1.0 — more tolerant of small alignment differences
            lines_right_aligned_threshold=2.0,    # default 1.0
            connected_border_tolerance=1.0,       # default 0.5 — more tolerant table border joining
        )
        cv.close()
*/