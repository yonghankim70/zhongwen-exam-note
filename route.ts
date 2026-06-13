import { NextResponse } from "next/server";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "detectedText",
    "wordExplanations",
    "overallMeaning",
    "scenarioMeanings",
    "dialogueExamples",
    "similarExpressions",
    "commonPatterns",
    "summary",
    "examTrends",
    "finalTakeaway",
  ],
  properties: {
    title: { type: "string" },
    detectedText: { type: "string" },
    wordExplanations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chinese", "pinyin", "koreanPronunciation", "meaning"],
        properties: {
          chinese: { type: "string" },
          pinyin: { type: "string" },
          koreanPronunciation: { type: "string" },
          meaning: { type: "string" },
        },
      },
    },
    overallMeaning: {
      type: "object",
      additionalProperties: false,
      required: ["literalKorean", "naturalKorean", "coreMeaning", "nuance"],
      properties: {
        literalKorean: { type: "string" },
        naturalKorean: { type: "string" },
        coreMeaning: { type: "string" },
        nuance: { type: "string" },
      },
    },
    scenarioMeanings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["situation", "meaning", "example"],
        properties: {
          situation: { type: "string" },
          meaning: { type: "string" },
          example: { type: "string" },
        },
      },
    },
    dialogueExamples: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "lines"],
        properties: {
          title: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["speaker", "chinese", "pinyin", "korean"],
              properties: {
                speaker: { type: "string" },
                chinese: { type: "string" },
                pinyin: { type: "string" },
                korean: { type: "string" },
              },
            },
          },
        },
      },
    },
    similarExpressions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chinese", "pinyin", "koreanPronunciation", "difference"],
        properties: {
          chinese: { type: "string" },
          pinyin: { type: "string" },
          koreanPronunciation: { type: "string" },
          difference: { type: "string" },
        },
      },
    },
    commonPatterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chinese", "pinyin", "korean", "usage"],
        properties: {
          chinese: { type: "string" },
          pinyin: { type: "string" },
          korean: { type: "string" },
          usage: { type: "string" },
        },
      },
    },
    summary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
      },
    },
    examTrends: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "reason", "sampleQuestion", "answerHint"],
        properties: {
          point: { type: "string" },
          reason: { type: "string" },
          sampleQuestion: { type: "string" },
          answerHint: { type: "string" },
        },
      },
    },
    finalTakeaway: { type: "string" },
  },
} as const;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-5.2";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY가 아직 설정되지 않았습니다. 배포 환경변수에 키를 넣으면 분석이 켜집니다.",
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
      { error: "사진 파일이 너무 큽니다. 더 가까이 찍거나 사진을 잘라서 다시 시도해 주세요." },
      { status: 413 }
    );
  }

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string }
  > = [
    {
      type: "input_text",
      text: buildPrompt(manualText, Boolean(image instanceof File)),
    },
  ];

  if (image instanceof File) {
    const dataUrl = await fileToDataUrl(image);
    content.push({ type: "input_image", image_url: dataUrl });
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content,
        },
      ],
      max_output_tokens: 6500,
      text: {
        format: {
          type: "json_schema",
          name: "chinese_exam_note",
          strict: true,
          schema: analysisSchema,
        },
      },
    }),
  });

  const payload = await openAiResponse.json();

  if (!openAiResponse.ok) {
    const message =
      payload?.error?.message ??
      "OpenAI 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: openAiResponse.status });
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    return NextResponse.json(
      { error: "분석 결과를 읽지 못했습니다. 더 선명한 사진으로 다시 시도해 주세요." },
      { status: 502 }
    );
  }

  try {
    return NextResponse.json({ result: JSON.parse(outputText) });
  } catch {
    return NextResponse.json(
      { error: "분석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요." },
      { status: 502 }
    );
  }
}

function buildPrompt(manualText: string, hasImage: boolean) {
  return `
너는 한국의 중어중문학과 학생을 돕는 중국어 시험 대비 튜터다.

목표:
- ${hasImage ? "첨부된 사진에서 중국어 문장을 정확히 OCR로 읽는다." : "사용자가 입력한 중국어 문장을 분석한다."}
- 결과는 한국어로 설명한다.
- 병음은 성조 표시를 포함한다.
- 한글 발음은 한국 학생이 읽기 쉽게 적되, 병음 학습을 방해하지 않게 보조 정보로 둔다.
- 시험 포인트는 중어중문학과 회화, 독해, 문법, 어휘 시험에서 자주 묻는 유형 중심으로 쓴다.

반드시 포함할 관점:
1. 단어별 설명: 핵심 단어 3~10개
2. 전체 의미: 직역, 자연스러운 한국어, 핵심 의미, 뉘앙스
3. 상황별 의미: 3~5개 상황
4. 실제 대화 예시: 2~3개 대화
5. 비슷한 표현과 비교: 3~6개
6. 대화에서 자주 쓰는 패턴: 3~6개
7. 정리: 5~7개 항목
8. 시험 포인트 / 출제 경향: 3~5개

출제 경향은 다음 유형을 우선 고려한다:
- 빈칸 채우기
- 한국어 해석
- 유사 표현 구별
- 어순 배열
- 상황에 맞는 표현 선택
- 품사와 문장 성분
- 문법 구조 설명

사용자가 직접 입력한 문장:
${manualText || "(직접 입력 없음)"}
`.trim();
}

async function fileToDataUrl(file: File) {
  const mimeType = file.type || "image/jpeg";
  const buffer = await file.arrayBuffer();
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

function extractOutputText(payload: {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}) {
  if (payload.output_text) {
    return payload.output_text;
  }

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text)
    .join("");
}
