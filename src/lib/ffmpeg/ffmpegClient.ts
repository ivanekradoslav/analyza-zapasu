import { FFmpeg } from "@ffmpeg/ffmpeg";
import { FFFSType } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

function coreBase(path: string) {
  // import.meta.env.BASE_URL obsahuje "/" alebo "/nazov-repa/" (GitHub Pages)
  return `${import.meta.env.BASE_URL}ffmpeg/${path}`.replace(/\/{2,}/g, "/");
}

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) {
      ffmpeg.on("log", ({ message }) => onLog(message));
    }

    // Jednovláknové jadro: core-mt 0.12.x padá pri reálnom exporte ("function signature mismatch" v pthread workeri).
    const base = coreBase("core");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

export async function terminateFFmpeg() {
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
    ffmpegInstance = null;
    loadPromise = null;
  }
}

/** Zamontuje veľký lokálny video súbor cez WORKERFS, aby sa nekopíroval celý do pamäte. */
export async function mountInputFile(ffmpeg: FFmpeg, file: File): Promise<string> {
  const mountDir = "/input";
  try {
    await ffmpeg.createDir(mountDir);
  } catch {
    // adresár už existuje
  }
  try {
    await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, mountDir);
    return `${mountDir}/${file.name}`;
  } catch (e) {
    console.warn("WORKERFS mount zlyhal, fallback na writeFile (celý súbor sa načíta do pamäte)", e);
    const data = await fetchFile(file);
    const fileName = "input" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
    await ffmpeg.writeFile(fileName, data);
    return fileName;
  }
}

export async function unmountInputFile(ffmpeg: FFmpeg) {
  try {
    await ffmpeg.unmount("/input");
  } catch {
    // nič, buď nebolo mountnuté alebo fallback cez writeFile
  }
}
