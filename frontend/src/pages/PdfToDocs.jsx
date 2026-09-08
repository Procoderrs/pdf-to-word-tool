import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import docsApi from "../../api/pdfToDocsApi";

const steps = [
  { n: "01", title: "Upload your PDF file", desc: "Drag a .pdf file in or click to browse." },
  { n: "02", title: "We convert it", desc: "Text and layout are extracted into an editable Word document." },
  { n: "03", title: "Download the result", desc: "Your .docx is ready to download and share." },
];

const features = [
  { title: "No sign-up", desc: "Convert straight away, no account or email required." },
  { title: "Processed, then discarded", desc: "Your file is deleted from our server right after conversion." },
  { title: "Editable output", desc: "Text comes out selectable and editable, not as a flat image." },
  { title: "Reliable output", desc: "Rendered with a real document engine, not a lookalike converter." },
];

export default function PdfToDocs() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setDownloadUrl(null);
    setError(null);

    if (rejectedFiles?.length) {
      setError("Only valid PDF (.pdf) files are supported.");
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
    const formData = new FormData();
    formData.append("pdfFile", file);

    try {
      // ⚠️ path confirm karo: /api/convert/convert hai ya /api/convert sirf
      const res = await docsApi.post("/api/convert", formData, {
        responseType: "blob",
        headers: { "Content-Type": "multipart/form-data" },
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
    } catch (err) {
      if (err.response && err.response.data) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorObj = JSON.parse(reader.result);
            setError(errorObj.detail || errorObj.error || "Conversion failed. Please try again.");
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
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  };

  const outputName = file?.name.replace(/\.pdf$/i, ".docx");

  return (
    <div className="min-h-screen bg-[#EAF2EE] text-[#132B22]">
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

      <header className="border-b border-[#CFE0D6] bg-[#F9F8F6]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 border-2 border-[#0F766E] rounded-sm flex items-center justify-center -rotate-6">
              <span className="text-[#0F766E] font-mono text-[10px] font-bold">PDF</span>
            </div>
            <span className="font-serif text-lg font-semibold tracking-tight">PdfToDocs</span>
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-[#5C6F66]">
            PDF &rarr; DOCX
          </span>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(#CFE0D6 1px, transparent 1px), linear-gradient(90deg, #CFE0D6 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <div className="max-w-5xl mx-auto px-6 pt-16 pb-20 relative">
          <div className="grid md:grid-cols-2 gap-14 items-start">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-[#0F766E] font-medium mb-4">
                Local conversion, not a middleman
              </p>
              <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-tight text-[#0E2A21]">
                Turn any PDF into an editable Word document
              </h1>
              <p className="mt-5 text-[#5C6F66] text-lg leading-relaxed max-w-md">
                Upload a .pdf file and get back a clean .docx with editable
                text — no third-party converter in between.
              </p>
            </div>

            <div className="bg-[#FBFDFB] border border-[#CFE0D6] rounded-xl p-6 shadow-sm">
              {!downloadUrl ? (
                <>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg py-12 px-4 text-center cursor-pointer transition
                      ${isDragActive ? "border-[#0F766E] bg-[#0F766E]/5" : "border-[#CFE0D6] hover:border-[#9FBBAC]"}`}
                  >
                    <input {...getInputProps()} />
                    {file ? (
                      <div>
                        <p className="text-sm font-medium text-[#0E2A21]">{file.name}</p>
                        <p className="font-mono text-xs text-[#5C6F66] mt-1">{formatSize(file.size)}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-[#0E2A21]">
                          {isDragActive ? "Drop it here" : "Drag a PDF file here"}
                        </p>
                        <p className="text-xs text-[#5C6F66] mt-1">or click to browse — max one file</p>
                      </div>
                    )}
                  </div>

                  {error && <p className="text-sm text-[#0F766E] mt-3 font-medium">{error}</p>}

                  <button
                    onClick={handleConvert}
                    disabled={!file || loading}
                    className="mt-5 w-full bg-[#0E2A21] text-[#FBFDFB] text-sm font-medium py-3 rounded-lg
                      hover:bg-[#173F31] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? "Converting..." : "Convert to Word"}
                  </button>

                  {file && !loading && (
                    <button
                      onClick={reset}
                      className="mt-2 w-full text-xs text-[#5C6F66] hover:text-[#0E2A21] transition"
                    >
                      Remove file
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="stamp-mark inline-flex flex-col items-center justify-center w-24 h-24 border-[3px] border-double border-[#0F766E] rounded-full -rotate-6">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-[#0F766E]">
                      CONVERTED
                    </span>
                    <span className="text-[#0F766E] text-xl leading-none mt-1">✓</span>
                  </div>

                  <p className="text-sm font-medium text-[#0E2A21] mt-5">Your file is ready</p>
                  <p className="font-mono text-xs text-[#5C6F66] mt-1 mb-6">{outputName}</p>

                  <a
                    href={downloadUrl}
                    download={outputName}
                    className="block w-full bg-[#0F766E] text-white text-sm font-medium py-3 rounded-lg hover:bg-[#0B5A54] transition text-center"
                  >
                    Download .docx
                  </a>
                  <button
                    onClick={reset}
                    className="mt-3 text-xs text-[#5C6F66] hover:text-[#0E2A21] transition"
                  >
                    Convert another file
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#CFE0D6] bg-[#FBFDFB]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-2xl font-semibold text-[#0E2A21] mb-10">How it works</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {steps.map((s) => (
              <div key={s.n}>
                <span className="font-mono text-sm text-[#0F766E] block mb-2">{s.n}</span>
                <h3 className="text-base font-semibold text-[#0E2A21] mb-1">{s.title}</h3>
                <p className="text-sm text-[#5C6F66] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#CFE0D6] bg-[#FBFDFB]">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <p className="text-xs text-[#5C6F66] text-center">
            Pages with complex backgrounds or unusual fonts may need minor
            manual adjustment after conversion.
          </p>
        </div>
      </section>

      <section className="border-t border-[#CFE0D6] bg-[#EAF2EE]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {features.map((f, i) => (
              <div key={i}>
                <h4 className="text-sm font-semibold text-[#0E2A21] mb-1">{f.title}</h4>
                <p className="text-xs text-[#5C6F66] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}