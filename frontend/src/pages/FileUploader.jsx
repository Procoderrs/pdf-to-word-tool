import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import api from "../../api/api";

const steps = [
  {
    n: "01",
    title: "Upload your PDF",
    desc: "Drag a file in or click to browse.",
  },
  {
    n: "02",
    title: "We rebuild it",
    desc: "The layout is read and reconstructed as real, editable paragraphs — not a scanned image.",
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
    title: "Processed, then discarded",
    desc: "Your file is deleted from our server right after conversion.",
  },
  {
    title: "Keeps formatting",
    desc: "Fonts, spacing and layout are preserved as closely as possible.",
  },
  {
    title: "Honest about limits",
    desc: "You'll get a clear heads-up if a page couldn't be rebuilt perfectly.",
  },
];

export default function FileUploader() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  const [imageOnlyWarning, setImageOnlyWarning] = useState(false);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setDownloadUrl(null);
    setError(null);
    setImageOnlyWarning(false);

    if (rejectedFiles?.length) {
      setError("Only valid PDF files are supported.");
      return;
    }

    const selectedFile = acceptedFiles[0];

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

  const handleConvert = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setImageOnlyWarning(false);
    const formData = new FormData();
    formData.append("pdfFile", file);

    try {
      const res = await api.post("/api/convert", formData, {
        responseType: "blob",
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.headers["x-conversion-mode"] === "image-only") {
        setImageOnlyWarning(true);
      }

      const url = window.URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
    } catch (err) {
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
    <div className="min-h-screen bg-[#ECE9E2] text-[#201E1B]">
      <style>{`
        @keyframes stampIn {
          0% { opacity: 0; transform: scale(1.6) rotate(-14deg); }
          60% { opacity: 1; transform: scale(0.94) rotate(-7deg); }
          100% { opacity: 1; transform: scale(1) rotate(-6deg); }
        }
        .stamp-mark { animation: stampIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .stamp-mark { animation: none; }
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-[#D8D3C7] bg-[#FDFCFA]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 border-2 border-[#9F2B1E] rounded-sm flex items-center justify-center -rotate-6">
              <span className="text-[#9F2B1E] font-mono text-[10px] font-bold">PDF</span>
            </div>
            <span className="font-serif text-lg font-semibold tracking-tight">PdfToWord</span>
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-[#6E685F]">
            PDF &rarr; DOCX
          </span>
        </div>
      </header>

      {/* Hero + tool */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(#D8D3C7 1px, transparent 1px), linear-gradient(90deg, #D8D3C7 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <div className="max-w-5xl mx-auto px-6 pt-16 pb-20 relative">
          <div className="grid md:grid-cols-2 gap-14 items-start">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-[#9F2B1E] font-medium mb-4">
                Local conversion, not a middleman
              </p>
              <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-tight text-[#1C1B19]">
                Turn any PDF into an editable Word file
              </h1>
              <p className="mt-5 text-[#6E685F] text-lg leading-relaxed max-w-md">
                Upload a PDF and get back a clean .docx you can actually edit
                — rebuilt paragraph by paragraph, right here, with no
                third-party converter in between.
              </p>

              
            </div>

            {/* Tool card */}
            <div className="bg-[#FDFCFA] border border-[#D8D3C7] rounded-xl p-6 shadow-sm">
              {!downloadUrl ? (
                <>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg py-12 px-4 text-center cursor-pointer transition
                      ${isDragActive ? "border-[#9F2B1E] bg-[#9F2B1E]/5" : "border-[#D8D3C7] hover:border-[#B3ACA0]"}`}
                  >
                    <input {...getInputProps()} />
                    {file ? (
                      <div>
                        <p className="text-sm font-medium text-[#1C1B19]">{file.name}</p>
                        <p className="font-mono text-xs text-[#6E685F] mt-1">{formatSize(file.size)}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-[#1C1B19]">
                          {isDragActive ? "Drop it here" : "Drag a PDF here"}
                        </p>
                        <p className="text-xs text-[#6E685F] mt-1">or click to browse — max one file</p>
                      </div>
                    )}
                  </div>

                  {error && <p className="text-sm text-[#9F2B1E] mt-3 font-medium">{error}</p>}

                  <button
                    onClick={handleConvert}
                    disabled={!file || loading}
                    className="mt-5 w-full bg-[#1C1B19] text-[#FDFCFA] text-sm font-medium py-3 rounded-lg
                      hover:bg-[#33312D] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? "Reconstructing layout..." : "Convert to Word"}
                  </button>

                  {file && !loading && (
                    <button
                      onClick={reset}
                      className="mt-2 w-full text-xs text-[#6E685F] hover:text-[#1C1B19] transition"
                    >
                      Remove file
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="stamp-mark inline-flex flex-col items-center justify-center w-24 h-24 border-[3px] border-double border-[#9F2B1E] rounded-full -rotate-6">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-[#9F2B1E]">
                      CONVERTED
                    </span>
                    <span className="text-[#9F2B1E] text-xl leading-none mt-1">✓</span>
                  </div>

                  <p className="text-sm font-medium text-[#1C1B19] mt-5">Your file is ready</p>
                  <p className="font-mono text-xs text-[#6E685F] mt-1 mb-6">
                    {file?.name.replace(".pdf", ".docx")}
                  </p>

                  {imageOnlyWarning && (
                    <p className="text-xs text-[#7A5A16] bg-[#A9822E]/10 border border-[#A9822E]/40 rounded-md px-3 py-2 mb-4 text-left">
                      This PDF appears to be scanned or image-based — the text couldn't be
                      made editable. The images have been embedded as-is.
                    </p>
                  )}

                  
                     <a href={downloadUrl}
                    download={file?.name.replace(".pdf", ".docx")}
                    className="block w-full bg-[#9F2B1E] text-white text-sm font-medium py-3 rounded-lg hover:bg-[#831F14] transition text-center"
                  >
                    Download .docx
                  </a>
                  <button
                    onClick={reset}
                    className="mt-3 text-xs text-[#6E685F] hover:text-[#1C1B19] transition"
                  >
                    Convert another file
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#D8D3C7] bg-[#FDFCFA]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-2xl font-semibold text-[#1C1B19] mb-10">How it works</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map((s) => (
              <div key={s.n}>
                <span className="font-mono text-sm text-[#9F2B1E] block mb-2">{s.n}</span>
                <h3 className="text-base font-semibold text-[#1C1B19] mb-1">{s.title}</h3>
                <p className="text-sm text-[#6E685F] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#D8D3C7] bg-[#FDFCFA]">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <p className="text-xs text-[#6E685F] text-center">
            Complex layouts — multi-column pages, dense tables, or heavily designed
            resumes — may shift slightly during conversion.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[#D8D3C7] bg-[#ECE9E2]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {features.map((f, i) => (
              <div key={i}>
                <h4 className="text-sm font-semibold text-[#1C1B19] mb-1">{f.title}</h4>
                <p className="text-xs text-[#6E685F] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}