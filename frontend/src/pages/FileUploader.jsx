import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import api from "../../api/api";
const steps = [
  {
    n: "01",
    title: "Upload your PDF",
    desc: "Drag a file in or click to browse. Your PDF is securely sent for conversion.",
  },
  {
    n: "02",
    title: "We convert it",
    desc: "CloudConvert processes your PDF and converts it into an editable Word document.",
  },
  {
    n: "03",
    title: "Download the result",
    desc: "Your .docx is ready to download and edit.",
  },
];

const features = [
  {
    title: "No sign-up",
    desc: "Convert straight away, no account or email required.",
  },
  {
    title: "Fast conversion",
    desc: "Your PDF is processed and converted into an editable Word file.",
  },
  {
    title: "Easy to use",
    desc: "Upload one PDF and download the converted DOCX.",
  },
  {
    title: "Keeps formatting",
    desc: "Fonts, spacing and layout are preserved as closely as possible.",
  },
];

export default function FileUploader() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
const [imageOnlyWarning, setImageOnlyWarning] = useState(false);
  // 1. Loophole Guard on Drop Phase
  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setDownloadUrl(null);
    setError(null);
    setImageOnlyWarning(false);

    if (rejectedFiles?.length) {
      setError("Only valid PDF files are supported.");
      return;
    }

    const selectedFile = acceptedFiles[0];
    
    // Size Limit Guard (15MB) - Prevents backend memory freeze
    if (selectedFile && selectedFile.size > 15 * 1024 * 1024) {
      setError("File size exceeds the 15MB safety limit.");
      return;
    }

    setFile(selectedFile);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  // 2. Secured Convert Trigger
  const handleConvert = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setImageOnlyWarning(false);
    const formData = new FormData();
    formData.append("pdfFile", file); // Backend file controller name matching

    try {
       const res = await api.post("/api/convert", formData, {
      responseType: "blob",
      headers: { "Content-Type": "multipart/form-data" },
    });

    // Backend ka header check karo — image-only PDF thi to warn karo
    if (res.headers["x-conversion-mode"] === "image-only") {
      setImageOnlyWarning(true);
    }

    const url = window.URL.createObjectURL(new Blob([res.data]));
    setDownloadUrl(url);
    } catch (err) {
      // Decode Binary Blob Error JSON to Standard Text
      if (err.response && err.response.data) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorObj = JSON.parse(reader.result);
            setError(errorObj.error || "Conversion failed. Please try again.");
          } catch (e) {
            setError("An unexpected server parsing error occurred.");
          }
        };
        reader.readAsText(err.response.data);
      } else {
        setError("Could not connect to the server. Please check your network.");
      }
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setDownloadUrl(null);
    setError(null);
    setImageOnlyWarning(false);
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  };

  return (
    <div className="min-h-screen bg-stone-50 text-slate-800">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center">
              <span className="text-amber-400 font-serif text-sm font-bold">P</span>
            </div>
            <span className="font-serif text-lg font-semibold tracking-tight">PdfToWord</span>
          </div>
          <span className="text-xs uppercase tracking-widest text-stone-400">
            PDF &rarr; DOCX
          </span>
        </div>
      </header>

      {/* Hero + tool */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-20">
        <div className="grid md:grid-cols-2 gap-14 items-start">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-600 font-medium mb-4">
              Free document conversion
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-tight text-slate-900">
              Turn any PDF into an editable Word file
            </h1>
            <p className="mt-5 text-stone-500 text-lg leading-relaxed max-w-md">
              Upload a PDF and get back a clean .docx you can actually edit —
              layout and formatting preserved, no watermark, no waiting on a
              third-party service.
            </p>

            <dl className="mt-10 grid grid-cols-2 gap-6 max-w-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-400">Engine</dt>
                <dd className="mt-1 text-sm font-medium text-slate-700">LibreOffice, self-hosted</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-stone-400">Output</dt>
                <dd className="mt-1 text-sm font-medium text-slate-700">.docx, ready to edit</dd>
              </div>
            </dl>
          </div>

          {/* Tool card */}
          <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
            {!downloadUrl ? (
              <>
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg py-12 px-4 text-center cursor-pointer transition
                    ${isDragActive ? "border-amber-500 bg-amber-50" : "border-stone-300 hover:border-stone-400"}`}
                >
                  <input {...getInputProps()} />
                  {file ? (
                    <div>
                      <p className="text-sm font-medium text-slate-700">{file.name}</p>
                      <p className="text-xs text-stone-400 mt-1">{formatSize(file.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {isDragActive ? "Drop it here" : "Drag a PDF here"}
                      </p>
                      <p className="text-xs text-stone-400 mt-1">or click to browse — max one file</p>
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-red-500 mt-3 font-medium">{error}</p>}

                <button
                  onClick={handleConvert}
                  disabled={!file || loading}
                  className="mt-5 w-full bg-slate-800 text-white text-sm font-medium py-3 rounded-lg
                    hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? "Reconstructing Layout..." : "Convert to Word"}
                </button>

                {file && !loading && (
                  <button
                    onClick={reset}
                    className="mt-2 w-full text-xs text-stone-400 hover:text-stone-600 transition"
                  >
                    Remove file
                  </button>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <span className="text-green-600 text-xl font-bold">✓</span>
                </div>
                <p className="text-sm font-medium text-slate-700">Your file is ready</p>
                <p className="text-xs text-stone-400 mt-1 mb-6">{file?.name.replace(".pdf", ".docx")}</p>

                {imageOnlyWarning && (
  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 text-left">
    This PDF appears to be scanned or image-based — the text couldn't be
    made editable. The images have been embedded as-is.
  </p>
)}

                <a
                  href={downloadUrl}
                  download={file?.name.replace(".pdf", ".docx")}
                  className="block w-full bg-amber-600 text-white text-sm font-medium py-3 rounded-lg hover:bg-amber-700 transition text-center"
                >
                  Download .docx
                </a>
                <button
                  onClick={reset}
                  className="mt-3 text-xs text-stone-400 hover:text-stone-600 transition"
                >
                  Convert another file
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-2xl font-semibold text-slate-900 mb-10">How it works</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map((s) => (
              <div key={s.n}>
                <span className="font-serif text-sm text-amber-600 block mb-2">{s.n}</span>
                <h3 className="text-base font-semibold text-slate-800 mb-1">{s.title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white">
  <div className="max-w-5xl mx-auto px-6 py-6">
    <p className="text-xs text-stone-400 text-center">
      Note: Complex layouts — multi-column pages, nested tables, or heavily
      designed resumes — may have minor formatting differences after conversion.
    </p>
  </div>
</section>

      {/* Features */}
      <section className="border-t border-stone-200 bg-stone-50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {features.map((f, i) => (
              <div key={i}>
                <h4 className="text-sm font-semibold text-slate-800 mb-1">{f.title}</h4>
                <p className="text-xs text-stone-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
