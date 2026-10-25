// Vygeneruje krátke syntetické "testovacie video zápasu" pre Playwright smoke test.
// Používa ffmpeg-static (nezávislé od systémového ffmpeg), takže funguje v CI aj lokálne.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import ffmpegPath from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../e2e/fixtures");
const outFile = path.join(outDir, "test-match.mp4");

fs.mkdirSync(outDir, { recursive: true });

if (fs.existsSync(outFile)) {
  console.log("Testovacie video už existuje:", outFile);
  process.exit(0);
}

console.log("Generujem testovacie video cez ffmpeg:", outFile);

execFileSync(
  ffmpegPath,
  [
    "-y",
    "-f", "lavfi",
    "-i", "testsrc2=size=640x360:rate=25:duration=12",
    "-f", "lavfi",
    "-i", "sine=frequency=440:duration=12",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    outFile,
  ],
  { stdio: "inherit" }
);

console.log("Hotovo.");
