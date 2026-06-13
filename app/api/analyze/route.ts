import { NextResponse } from "next/server";

type GeminiPayload = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY가 아직 설정되지 않았습니다. Vercel 환경변수에 Gemini 키를 넣으면 분석이 켜집니다.",
      },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const image = formData.get("image");
  const manualText = String(formData.get("manualText") ?? "").trim();

  if (!(image instanceof File) && !manualText) {
    return NextResponse.json(
      { error: "사진을 선택하거나 중국어 문장을 입력해 주세요." },
      { status: 400 }
    );
  }

  if (image instanceof File && image.size > 4 * 1024 * 1024) {
    return NextResponse.json(
      {
        error:
          "사진 파일이 너무 큽니다. 더 가까이 찍거나 사진을 잘라서 다시 시도해 주세요.",
      },
      { status: 413 }
    );
  }

  const parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [];

  if (image instanceof File) {
    parts.push(await fileToGeminiInlineData(image));
  }

  parts.push({ text: buildPrompt(manualText, image instanceof File) });

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  const payload = (await geminiResponse.json()) as GeminiPayload;

  if (!geminiResponse.ok) {
    const message =
      payload.error?.message ??
      "Gemini 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: geminiResponse.status });
  }

  const outputText = extractGeminiOutputText(payload);
  if (!outputText) {
    return NextResponse.json(
      { error: "분석 결과를 읽지 못했습니다. 더 선명한 사진으로 다시 시도해 주세요." },
      { status: 502 }
    );
  }

  try {
    const result = parseAnalysisJson(outputText);
    if (!result) {
      throw new Error("Invalid Gemini JSON");
    }
    return NextResponse.json({ result });
  } catch {
    const finishReason = payload.candidates?.[0]?.finishReason;
    console.error("Gemini JSON parse failed", {
      finishReason,
      outputLength: outputText.length,
    });

    return NextResponse.json(
      {
        error:
          finishReason === "MAX_TOKENS"
            ? "분석 내용이 너무 길어 중간에 잘렸습니다. 문장을 조금 짧게 입력하거나 다시 시도해 주세요."
            : "Gemini 답변 형식을 앱이 읽지 못했습니다. 다시 한 번 눌러 주세요.",
      },
      { status: 502 }
    );
  }
}

function buildPrompt(manualText: string, hasImage: boolean) {
  return `
너는 한국의 중어중문학과 학생을 돕는 중국어 시험 대비 튜터다.

${hasImage ? "첨부된 사진에서 중국어 문장을 정확히 읽고 분석해라." : "사용자가 입력한 중국어 문장을 분석해라."}
반드시 JSON 객체 하나만 출력해라. 설명 문장, 마크다운, 코드블록은 절대 붙이지 마라.
모든 문자열은 큰따옴표를 사용하고, 마지막 쉼표는 넣지 마라.
각 설명은 짧게 써라. 한 항목은 보통 1문장으로 제한해라.

JSON 구조:
{
  "title": "문장 또는 표현 제목",
  "detectedText": "인식한 중국어 원문",
  "wordExplanations": [
    {
      "chinese": "중국어 단어",
      "pinyin": "성조 포함 병음",
      "koreanPronunciation": "한국어식 보조 발음",
      "meaning": "한국어 뜻"
    }
  ],
  "overallMeaning": {
    "literalKorean": "직역",
    "naturalKorean": "자연스러운 한국어",
    "coreMeaning": "핵심 의미",
    "nuance": "뉘앙스"
  },
  "scenarioMeanings": [
    {
      "situation": "상황",
      "meaning": "의미",
      "example": "예문"
    }
  ],
  "dialogueExamples": [
    {
      "title": "대화 상황",
      "lines": [
        {
          "speaker": "A",
          "chinese": "중국어 대화문",
          "pinyin": "성조 포함 병음",
          "korean": "한국어 번역"
        }
      ]
    }
  ],
  "similarExpressions": [
    {
      "chinese": "비슷한 표현",
      "pinyin": "성조 포함 병음",
      "koreanPronunciation": "한국어식 보조 발음",
      "difference": "차이점"
    }
  ],
  "commonPatterns": [
    {
      "chinese": "자주 쓰는 패턴",
      "pinyin": "성조 포함 병음",
      "korean": "한국어 의미",
      "usage": "사용 상황"
    }
  ],
  "summary": [
    {
      "label": "항목",
      "value": "내용"
    }
  ],
  "examTrends": [
    {
      "point": "시험 포인트",
      "reason": "출제 이유",
      "sampleQuestion": "출제 예시",
      "answerHint": "답안 포인트"
    }
  ],
  "finalTakeaway": "마지막 한 줄 정리"
}

작성 기준:
- 결과는 한국어로 설명한다.
- 병음은 성조 표시를 포함한다.
- 한글 발음은 보조 정보로만 적는다.
- 단어별 설명은 핵심 단어 3~7개로 한다.
- 상황별 의미는 3개로 한다.
- 실제 대화 예시는 2개로 한다.
- 비슷한 표현과 자주 쓰는 패턴은 각각 3개로 한다.
- 정리는 5~7개 항목으로 한다.
- 시험 포인트는 빈칸 채우기, 한국어 해석, 유사 표현 구별, 어순 배열, 상황에 맞는 표현 선택, 품사와 문장 성분, 문법 구조 설명 중심으로 3개를 작성한다.

사용자가 직접 입력한 문장:
${manualText || "(직접 입력 없음)"}
`.trim();
}

async function fileToGeminiInlineData(file: File) {
  const mimeType = file.type || "image/jpeg";
  const buffer = await file.arrayBuffer();

  return {
    inline_data: {
      mime_type: mimeType,
      data: Buffer.from(buffer).toString("base64"),
    },
  };
}

function extractGeminiOutputText(payload: GeminiPayload) {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("");
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseAnalysisJson(text: string) {
  const cleaned = stripJsonFence(text);
  const candidates = [
    cleaned,
    extractJsonObject(cleaned),
    stripTrailingCommas(cleaned),
    stripTrailingCommas(extractJsonObject(cleaned) ?? ""),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next possible JSON shape.
    }
  }

  return null;
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function stripTrailingCommas(text: string) {
  return text.replace(/,\s*([}\]])/g, "$1");
}
