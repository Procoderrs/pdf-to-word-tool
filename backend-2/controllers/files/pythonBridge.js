// Poori PDF ek hi call mein Python ko bhejta hai (per-element nahi,
// jaisa purana OCR/complex-vector bridge tha) — kyunki ab extraction
// ka poora kaam Python mein ho raha hai.
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

export async function extractPdfViaPython(pdfBuffer) {
  const tmpPath = path.join(os.tmpdir(), `pdf-${Date.now()}.pdf`);
  await fs.writeFile(tmpPath, pdfBuffer);

  try {
    return await new Promise((resolve, reject) => {
const py = spawn("python3", ["scripts/resolve_elements.py", tmpPath]);
      let out = "", err = "";
      py.stdout.on("data", (d) => (out += d));
      py.stderr.on("data", (d) => (err += d));
      py.on("close", (code) => {
        if (code !== 0) return reject(new Error(`Python exited ${code}: ${err}`));
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error("Invalid JSON from Python: " + out.slice(0, 300)));
        }
      });
    });
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}