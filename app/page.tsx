"use client";

import type {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type WordExplanation = {
  chinese: string;
  pinyin: string;
  koreanPronunciation: string;
  meaning: string;
};

type OverallMeaning = {
  literalKorean: string;
  naturalKorean: string;
  coreMeaning: string;
  nuance: string;
};

type ScenarioMeaning = {
  situation: string;
  meaning: string;
  example: string;
};

type DialogueLine = {
  speaker: string;
  chinese: string;
  pinyin: string;
  korean: string;
};

type DialogueExample = {
  title: string;
  lines: DialogueLine[];
};

type SimilarExpression = {
  chinese: string;
  pinyin: string;
  koreanPronunciation: string;
  difference: string;
};

type CommonPattern = {
  chinese: string;
  pinyin: string;
  korean: string;
  usage: string;
};

type SummaryRow = {
  label: string;
  value: string;
};

type ExamTrend = {
  point: string;
  reason: string;
  sampleQuestion: string;
  answerHint: string;
};

type AnalysisResult = {
  title: string;
  detectedText: string;
  wordExplanations: WordExplanation[];
  overallMeaning: OverallMeaning;
  scenarioMeanings: ScenarioMeaning[];
  dialogueExamples: DialogueExample[];
  similarExpressions: SimilarExpression[];
  commonPatterns: CommonPattern[];
  summary: SummaryRow[];
  examTrends: ExamTrend[];
  finalTakeaway: string;
};

type SavedNote = {
  id: string;
  createdAt: string;
  result: AnalysisResult;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type CropSelection = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const emptyText =
  "사진 인식이 애매할 때는 여기에 중국어 문장을 직접 입력해도 됩니다.";
const maxUploadBytes = 3.2 * 1024 * 1024;
const maxImageEdge = 1600;
const brushPaddingX = 0.08;
const brushPaddingY = 0.055;
const cropStep = 0.04;

let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechHelpShown = false;

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [cropSelection, setCropSelection] = useState<CropSelection | null>(null);
  const [isSelectingCrop, setIsSelectingCrop] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCrop = useMemo(
    () => getNormalizedCrop(cropSelection),
    [cropSelection]
  );
  const hasCropSelection = Boolean(selectedCrop && isUsableCrop(selectedCrop));

  const canAnalyze = useMemo(() => {
    return Boolean(selectedFile || manualText.trim()) && !isAnalyzing && isOnline;
  }, [isAnalyzing, isOnline, manualText, selectedFile]);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstall);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const stored = window.localStorage.getItem("zhongwen-notes");
    if (stored) {
      try {
        setSavedNotes(JSON.parse(stored) as SavedNote[]);
      } catch {
        window.localStorage.removeItem("zhongwen-notes");
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstall);
    };
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      setCropSelection(null);
      return;
    }

    const nextUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  function saveNote(nextResult: AnalysisResult) {
    const nextNotes = [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        result: nextResult,
      },
      ...savedNotes,
    ].slice(0, 6);

    setSavedNotes(nextNotes);
    window.localStorage.setItem("zhongwen-notes", JSON.stringify(nextNotes));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile && !manualText.trim()) {
      setError("사진을 선택하거나 중국어 문장을 입력해 주세요.");
      return;
    }
    if (!isOnline) {
      setError("1차 버전은 분석할 때 인터넷 연결이 필요합니다.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append(
          "image",
          await prepareImageForUpload(
            selectedFile,
            hasCropSelection ? selectedCrop : null
          )
        );
      }
      formData.append("manualText", manualText.trim());

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const payload = await readAnalyzeResponse(response);

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "분석에 실패했습니다.");
      }

      setResult(payload.result);
      saveNote(payload.result);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "분석 중 문제가 생겼습니다."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleInstall() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setCropSelection(null);
    setError(null);
  }

  function getCropPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function handleCropStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (!previewUrl) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCropPoint(event);
    setIsSelectingCrop(true);
    setCropSelection(rectToSelection(getBrushRect(point.x, point.y)));
  }

  function handleCropMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isSelectingCrop) {
      return;
    }

    event.preventDefault();
    const point = getCropPoint(event);
    setCropSelection((current) =>
      rectToSelection(mergeCrops(getNormalizedCrop(current), getBrushRect(point.x, point.y)))
    );
  }

  function handleCropEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isSelectingCrop) {
      return;
    }

    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const point = getCropPoint(event);
    setCropSelection((current) => {
      const next = rectToSelection(
        mergeCrops(getNormalizedCrop(current), getBrushRect(point.x, point.y))
      );
      const nextCrop = getNormalizedCrop(next);
      return nextCrop && isUsableCrop(nextCrop) ? next : null;
    });
    setIsSelectingCrop(false);
  }

  function updateCropRect(getNext: (crop: CropRect) => CropRect) {
    setCropSelection((current) => {
      const crop = getNormalizedCrop(current);
      if (!crop) {
        return rectToSelection({ x: 0.1, y: 0.35, width: 0.8, height: 0.22 });
      }

      return rectToSelection(normalizeCropRect(getNext(crop)));
    });
  }

  function expandCrop() {
    updateCropRect((crop) => ({
      x: crop.x - cropStep,
      y: crop.y - cropStep,
      width: crop.width + cropStep * 2,
      height: crop.height + cropStep * 2,
    }));
  }

  function shrinkCrop() {
    updateCropRect((crop) => ({
      x: crop.x + cropStep,
      y: crop.y + cropStep,
      width: crop.width - cropStep * 2,
      height: crop.height - cropStep * 2,
    }));
  }

  function moveCrop(dx: number, dy: number) {
    updateCropRect((crop) => ({
      ...crop,
      x: crop.x + dx,
      y: crop.y + dy,
    }));
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#18201d]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 border-b border-[#d8ded5] pb-4">
          <div>
            <p className="text-xs font-semibold text-[#0f766e]">중어중문학과 시험 공부</p>
            <h1 className="mt-1 text-2xl font-bold tracking-normal sm:text-3xl">
              중문시험노트
            </h1>
            <p className="mt-1 text-xs font-semibold text-[#0f766e]">
              Gemini 버전 적용 완료
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isOnline ? "bg-[#0f766e]" : "bg-[#b42318]"
              }`}
              aria-hidden="true"
            />
            <span className="text-sm font-medium">
              {isOnline ? "온라인" : "오프라인"}
            </span>
            {installPrompt ? (
              <button className="tool-button" onClick={handleInstall} type="button">
                설치
              </button>
            ) : null}
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <form
            className="space-y-4 rounded-lg border border-[#d8ded5] bg-white p-4 shadow-sm"
            onSubmit={handleSubmit}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">사진 또는 문장</h2>
                <button
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  사진 선택
                </button>
              </div>

              <input
                ref={fileInputRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  handleFileChange(file);
                }}
                type="file"
              />

              {previewUrl ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#0f766e]">
                    중국어 글씨 위를 손가락으로 문지르세요. 선택한 부분만 분석합니다.
                  </p>
                  <div
                    className="crop-zone"
                    onPointerCancel={handleCropEnd}
                    onPointerDown={handleCropStart}
                    onPointerMove={handleCropMove}
                    onPointerUp={handleCropEnd}
                    role="img"
                    aria-label="분석할 중국어 글씨 영역 선택"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="선택한 중국어 문장 사진"
                      className="crop-image"
                      draggable={false}
                      src={previewUrl}
                    />
                    {selectedCrop ? (
                      <div
                        className="crop-box"
                        style={{
                          left: `${selectedCrop.x * 100}%`,
                          top: `${selectedCrop.y * 100}%`,
                          width: `${selectedCrop.width * 100}%`,
                          height: `${selectedCrop.height * 100}%`,
                        }}
                      >
                        <span>이 부분만 분석</span>
                      </div>
                    ) : (
                      <div className="crop-hint">글씨 부분을 문질러 선택</div>
                    )}
                  </div>
                  {hasCropSelection ? (
                    <div className="space-y-2">
                      <div className="crop-controls" aria-label="선택 영역 조절">
                        <button type="button" onClick={() => moveCrop(0, -cropStep)}>
                          위
                        </button>
                        <button type="button" onClick={expandCrop}>
                          넓게
                        </button>
                        <button type="button" onClick={() => moveCrop(0, cropStep)}>
                          아래
                        </button>
                        <button type="button" onClick={() => moveCrop(-cropStep, 0)}>
                          왼쪽
                        </button>
                        <button type="button" onClick={shrinkCrop}>
                          좁게
                        </button>
                        <button type="button" onClick={() => moveCrop(cropStep, 0)}>
                          오른쪽
                        </button>
                      </div>
                      <button
                        className="secondary-button w-full"
                        onClick={() => setCropSelection(null)}
                        type="button"
                      >
                        선택 해제하고 전체 사진 분석
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <button
                  className="camera-zone"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <span>
                    카메라로 찍거나
                    <br />
                    중국어 문장 사진을 선택하세요
                  </span>
                </button>
              )}
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-semibold">직접 입력</span>
              <textarea
                className="min-h-28 w-full resize-y rounded-lg border border-[#cfd7cd] bg-[#fbfcfa] p-3 text-base leading-7 outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#9ad6c8]"
                onChange={(event) => setManualText(event.target.value)}
                placeholder={emptyText}
                value={manualText}
              />
            </label>

            <div className="rounded-lg border border-[#f1c2bd] bg-[#fff7f5] p-3 text-sm text-[#7a271a]">
              Gemini API로 분석합니다. 분석할 때 인터넷이 필요하고, 한 번 열린
              앱 화면은 휴대폰에 설치해 다시 열 수 있습니다.
            </div>

            {error ? (
              <div className="rounded-lg border border-[#f1c2bd] bg-[#fff7f5] p-3 text-sm font-medium text-[#7a271a]">
                {error}
              </div>
            ) : null}

            <button className="primary-button" disabled={!canAnalyze} type="submit">
              {isAnalyzing ? "분석 중..." : "시험노트 만들기"}
            </button>
          </form>

          <section className="min-h-[520px] rounded-lg border border-[#d8ded5] bg-white p-4 shadow-sm">
            {result ? <AnalysisView result={result} /> : <EmptyResult />}
          </section>
        </section>

        {savedNotes.length ? (
          <section className="rounded-lg border border-[#d8ded5] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">최근 노트</h2>
              <button
                className="secondary-button"
                onClick={() => {
                  setSavedNotes([]);
                  window.localStorage.removeItem("zhongwen-notes");
                }}
                type="button"
              >
                지우기
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {savedNotes.map((note) => (
                <button
                  className="saved-note"
                  key={note.id}
                  onClick={() => setResult(note.result)}
                  type="button"
                >
                  <span className="text-sm font-bold">{note.result.title}</span>
                  <span className="line-clamp-2 text-xs text-[#5b665f]">
                    {note.result.detectedText}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

async function readAnalyzeResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as
      | { result: AnalysisResult }
      | { error: string };
  }

  const text = await response.text();
  if (/request entity too large/i.test(text)) {
    return {
      error:
        "사진 용량이 너무 큽니다. 앱이 자동 압축을 시도했지만, 더 가까이 찍거나 사진을 한 번 잘라서 다시 올려 주세요.",
    };
  }

  return {
    error:
      text.slice(0, 160) ||
      `서버가 예상과 다른 응답을 보냈습니다. 상태 코드: ${response.status}`,
  };
}

async function prepareImageForUpload(file: File, crop: CropRect | null) {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }

  let nextFile = file;

  if (crop && isUsableCrop(crop)) {
    nextFile = await cropImageFile(file, crop);
  }

  if (nextFile.size <= maxUploadBytes) {
    return nextFile;
  }

  const dataUrl = await readFileAsDataUrl(nextFile);
  const image = await loadImage(dataUrl);
  let edge = maxImageEdge;
  let quality = 0.82;
  let compressed = await renderCompressedImage(image, edge, quality);

  while (compressed.size > maxUploadBytes && quality > 0.52) {
    quality -= 0.1;
    compressed = await renderCompressedImage(image, edge, quality);
  }

  while (compressed.size > maxUploadBytes && edge > 900) {
    edge -= 220;
    compressed = await renderCompressedImage(image, edge, 0.66);
  }

  if (compressed.size > maxUploadBytes) {
    throw new Error("사진 용량이 너무 큽니다. 사진을 조금 잘라서 다시 올려 주세요.");
  }

  return new File([compressed], "chinese-note-photo.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function cropImageFile(file: File, crop: CropRect) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const sourceX = Math.round(image.naturalWidth * crop.x);
  const sourceY = Math.round(image.naturalHeight * crop.y);
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * crop.width));
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("선택한 영역을 자르지 못했습니다.");
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  const blob = await canvasToJpeg(canvas, 0.92);
  return new File([blob], "selected-chinese-text.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("사진을 불러오지 못했습니다."));
    image.src = src;
  });
}

function renderCompressedImage(
  image: HTMLImageElement,
  maxEdge: number,
  quality: number
) {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("사진 압축을 준비하지 못했습니다.");
  }

  context.drawImage(image, 0, 0, width, height);

  return canvasToJpeg(canvas, quality);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("사진 압축에 실패했습니다."));
        }
      },
      "image/jpeg",
      quality
    );
  });
}

function getNormalizedCrop(selection: CropSelection | null): CropRect | null {
  if (!selection) {
    return null;
  }

  const x = Math.min(selection.startX, selection.endX);
  const y = Math.min(selection.startY, selection.endY);
  const width = Math.abs(selection.endX - selection.startX);
  const height = Math.abs(selection.endY - selection.startY);

  return { x, y, width, height };
}

function getBrushRect(x: number, y: number): CropRect {
  return normalizeCropRect({
    x: x - brushPaddingX,
    y: y - brushPaddingY,
    width: brushPaddingX * 2,
    height: brushPaddingY * 2,
  });
}

function mergeCrops(first: CropRect | null, second: CropRect | null): CropRect | null {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }

  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);

  return normalizeCropRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function normalizeCropRect(crop: CropRect): CropRect {
  const width = clamp(crop.width, 0.06, 1);
  const height = clamp(crop.height, 0.06, 1);
  const x = clamp(crop.x, 0, 1 - width);
  const y = clamp(crop.y, 0, 1 - height);

  return { x, y, width, height };
}

function rectToSelection(crop: CropRect | null): CropSelection | null {
  if (!crop) {
    return null;
  }

  const next = normalizeCropRect(crop);
  return {
    startX: next.x,
    startY: next.y,
    endX: next.x + next.width,
    endY: next.y + next.height,
  };
}

function isUsableCrop(crop: CropRect) {
  return crop.width >= 0.06 && crop.height >= 0.06;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function EmptyResult() {
  return (
    <div className="flex h-full min-h-[480px] flex-col justify-center gap-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-[#e4f4ef] text-3xl">
        文
      </div>
      <div>
        <h2 className="text-xl font-bold">분석 결과가 여기에 정리됩니다</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5b665f]">
          사진을 찍으면 단어, 전체 의미, 상황별 의미, 대화 예시, 유사 표현,
          패턴, 정리, 시험 포인트까지 한 번에 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}

function AnalysisView({ result }: { result: AnalysisResult }) {
  return (
    <article className="space-y-7">
      <div className="border-b border-[#d8ded5] pb-4">
        <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-md bg-[#e4f4ef] px-3 py-1 text-sm font-bold text-[#0b5d56]">
          <span className="break-words">{result.detectedText}</span>
          <SpeakButton text={result.detectedText} />
        </div>
        <h2 className="text-2xl font-bold">{result.title}</h2>
      </div>

      <NumberedSection number="1" title="단어별 설명">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>중국어</th>
                <th>병음</th>
                <th>한글 발음</th>
                <th>뜻</th>
              </tr>
            </thead>
            <tbody>
              {result.wordExplanations.map((word, index) => (
                <tr key={`${word.chinese}-${index}`}>
                  <td>
                    <ChineseText text={word.chinese} />
                  </td>
                  <td>{word.pinyin}</td>
                  <td>{word.koreanPronunciation}</td>
                  <td>{word.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NumberedSection>

      <NumberedSection number="2" title="전체 의미">
        <dl className="meaning-list">
          <div>
            <dt>직역</dt>
            <dd>{result.overallMeaning.literalKorean}</dd>
          </div>
          <div>
            <dt>자연스러운 한국어</dt>
            <dd>{result.overallMeaning.naturalKorean}</dd>
          </div>
          <div>
            <dt>핵심 의미</dt>
            <dd>{result.overallMeaning.coreMeaning}</dd>
          </div>
          <div>
            <dt>뉘앙스</dt>
            <dd>{result.overallMeaning.nuance}</dd>
          </div>
        </dl>
      </NumberedSection>

      <NumberedSection number="3" title="상황별 의미">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>상황</th>
                <th>의미</th>
                <th>예문</th>
              </tr>
            </thead>
            <tbody>
              {result.scenarioMeanings.map((scenario, index) => (
                <tr key={`${scenario.situation}-${index}`}>
                  <td>{scenario.situation}</td>
                  <td>{scenario.meaning}</td>
                  <td>{scenario.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NumberedSection>

      <NumberedSection number="4" title="실제 대화 예시">
        <div className="space-y-4">
              {result.dialogueExamples.map((dialogue, index) => (
            <div className="dialogue-block" key={`${dialogue.title}-${index}`}>
              <h4>{dialogue.title}</h4>
              {dialogue.lines.map((line, lineIndex) => (
                <p key={`${line.speaker}-${lineIndex}`}>
                  <strong>{line.speaker}:</strong>{" "}
                  <ChineseText text={line.chinese} />
                  <br />
                  <span>병음: {line.pinyin}</span>
                  <br />
                  <span>한국어: {line.korean}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      </NumberedSection>

      <NumberedSection number="5" title="비슷한 표현과 비교">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>중국어</th>
                <th>병음</th>
                <th>한글 발음</th>
                <th>차이</th>
              </tr>
            </thead>
            <tbody>
              {result.similarExpressions.map((expression, index) => (
                <tr key={`${expression.chinese}-${index}`}>
                  <td>
                    <ChineseText text={expression.chinese} />
                  </td>
                  <td>{expression.pinyin}</td>
                  <td>{expression.koreanPronunciation}</td>
                  <td>{expression.difference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NumberedSection>

      <NumberedSection number="6" title="대화에서 자주 쓰는 패턴">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>중국어</th>
                <th>병음</th>
                <th>한국어</th>
                <th>사용</th>
              </tr>
            </thead>
            <tbody>
              {result.commonPatterns.map((pattern, index) => (
                <tr key={`${pattern.chinese}-${index}`}>
                  <td>
                    <ChineseText text={pattern.chinese} />
                  </td>
                  <td>{pattern.pinyin}</td>
                  <td>{pattern.korean}</td>
                  <td>{pattern.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NumberedSection>

      <NumberedSection number="7" title="정리">
        <div className="responsive-table">
          <table>
            <tbody>
              {result.summary.map((row, index) => (
                <tr key={`${row.label}-${index}`}>
                  <th>{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-lg bg-[#fff8e6] p-3 text-sm font-semibold text-[#7a4b00]">
          {result.finalTakeaway}
        </p>
      </NumberedSection>

      <NumberedSection number="8" title="시험 포인트">
        <div className="space-y-3">
          {result.examTrends.map((trend, index) => (
            <div className="exam-point" key={`${trend.point}-${index}`}>
              <h4>{trend.point}</h4>
              <p>{trend.reason}</p>
              <p>
                <strong>출제 예시:</strong> {trend.sampleQuestion}
              </p>
              <p>
                <strong>답안 포인트:</strong> {trend.answerHint}
              </p>
            </div>
          ))}
        </div>
      </NumberedSection>
    </article>
  );
}

function NumberedSection({
  children,
  number,
  title,
}: {
  children: ReactNode;
  number: string;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <span className="section-number">{number}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ChineseText({ text }: { text: string }) {
  return (
    <span className="chinese-text">
      <span>{text}</span>
      <SpeakButton text={text} />
    </span>
  );
}

function SpeakButton({ text }: { text: string }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      setIsSupported(false);
      return;
    }

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    setIsSupported(true);
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  async function speak() {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      setIsSupported(false);
      return;
    }

    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    const synth = window.speechSynthesis;
    if (isSpeaking) {
      synth.cancel();
      activeUtterance = null;
      setIsSpeaking(false);
      return;
    }

    synth.cancel();
    synth.resume();

    const latestVoices = await waitForSpeechVoices(synth);
    if (latestVoices.length) {
      setVoices(latestVoices);
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "zh-CN";
    utterance.rate = 0.82;
    utterance.pitch = 1;
    utterance.volume = 1;
    const mandarinVoice = pickMandarinVoice(
      latestVoices.length ? latestVoices : voices
    );
    let didStart = false;

    utterance.voice = mandarinVoice;
    utterance.onstart = () => {
      didStart = true;
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
        setIsSpeaking(false);
      }
    };
    utterance.onerror = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
        setIsSpeaking(false);
      }
      showSpeechHelp();
    };

    activeUtterance = utterance;
    setIsSpeaking(true);
    synth.speak(utterance);

    window.setTimeout(() => {
      if (activeUtterance === utterance) {
        synth.resume();
      }
    }, 120);

    window.setTimeout(() => {
      if (activeUtterance === utterance && !didStart && !synth.speaking) {
        activeUtterance = null;
        setIsSpeaking(false);
        showSpeechHelp();
      }
    }, 1600);
  }

  return (
    <button
      aria-label={`${text} 중국어 표준어로 듣기`}
      className={`speaker-button ${isSpeaking ? "is-speaking" : ""}`}
      disabled={!isSupported}
      onClick={speak}
      title={isSupported ? "중국어 표준어로 듣기" : "이 브라우저는 음성 읽기를 지원하지 않습니다"}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="M16 8.5a5 5 0 0 1 0 7" />
        <path d="M18.6 6a8 8 0 0 1 0 12" />
      </svg>
    </button>
  );
}

function pickMandarinVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => /zh[-_]?CN|cmn[-_]?Hans[-_]?CN/i.test(voice.lang)) ??
    voices.find((voice) => /^zh/i.test(voice.lang)) ??
    null
  );
}

function waitForSpeechVoices(synth: SpeechSynthesis) {
  const voices = synth.getVoices();
  if (voices.length) {
    return Promise.resolve(voices);
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      window.clearTimeout(timer);
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };

    const timer = window.setTimeout(finish, 1200);
    synth.addEventListener("voiceschanged", finish);
  });
}

function showSpeechHelp() {
  if (speechHelpShown || typeof window === "undefined") {
    return;
  }

  speechHelpShown = true;
  window.alert(
    "휴대폰에서 중국어 음성이 켜지지 않았습니다.\n\n설정 > 일반 관리 > 글자 읽어주기 또는 텍스트 음성 변환에서 Google 음성 서비스를 선택하고, 중국어(중국/보통화) 음성을 설치해 주세요.\n\n그리고 휴대폰 미디어 볼륨도 확인해 주세요."
  );
}
