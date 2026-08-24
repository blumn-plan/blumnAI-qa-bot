/** AI 답변 끝에 붙는 「### 📋 변경 제안」 블록 파싱 + 기획전달 초안 생성.
 *  qa.service.ts 의 시스템 프롬프트가 정책 변경이 필요할 때 이 블록을 답변에 붙이도록 지시. */

export interface ChangeProposal {
  title: string;
  target: string;
  section: string;
  before: string;
  after: string;
  reason: string;
}

/** 답변 텍스트에서 「### 📋 변경 제안」 블록의 6필드 추출. 없으면 null.
 *  · 블록 종료 지점: 다음 `###` · `##` · 닫는 코드펜스 `\n```` · 문자열 끝 중 가장 이른 위치.
 *    ← 닫는 fence 를 포함하지 않아야 마지막 필드 (💡 근거) 값에 orphan ``` 이 안 딸려옴.
 *  · 각 필드 값은 trim + trailing ``` fence 제거 (Claude 가 fence 안에 값을 배치한 경우 대비). */
export function parseChangeProposal(answer: string): ChangeProposal | null {
  const m = answer.match(/### 📋 변경 제안\s*\n([\s\S]*?)(?=\n###|\n##|\n```|$)/);
  if (!m) return null;
  const block = m[1];
  const get = (label: string) => {
    const re = new RegExp(`-\\s*${label}:?\\s*([\\s\\S]*?)(?=\\n-\\s*[📌📄📍✏️✅💡]|$)`);
    const r = block.match(re);
    if (!r) return "";
    // 값 뒤에 남은 code fence · 빈 줄 정리 (안전망 · 위 outer regex 가 이미 걸러도 이중 방어)
    return r[1].replace(/\n?```\s*$/g, "").trim();
  };
  return {
    title: get("📌\\s*요청\\s*제목"),
    target: get("📄\\s*대상\\s*파일"),
    section: get("📍\\s*위치"),
    before: get("✏️\\s*변경\\s*전"),
    after: get("✅\\s*변경\\s*후"),
    reason: get("💡\\s*근거"),
  };
}

/** 변경 제안 블록 → 「## 합의 요약」 markdown 본문 조립. */
export function proposalToSummary(p: ChangeProposal): string {
  const parts: string[] = ["## 합의 요약"];
  if (p.target) parts.push(`- 📄 **대상 파일**: ${p.target}`);
  if (p.section) parts.push(`- 📍 **위치**: ${p.section}`);
  if (p.before) parts.push(`- ✏️ **변경 전**: ${p.before}`);
  if (p.after) parts.push(`- ✅ **변경 후**: ${p.after}`);
  if (p.reason) parts.push(`- 💡 **근거**: ${p.reason}`);
  return parts.join("\n");
}

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: string;
}

/** 답변에 변경 제안 블록이 없을 때 · 최근 Q/A 3라운드를 구조화된 fallback 요약으로. */
export function buildFallbackSummary(
  messages: Message[],
  docTitle: string,
): { title: string; body: string } {
  const pairs: Array<{ q: string; a: string }> = [];
  let lastU: Message | null = null;
  for (const m of messages) {
    if (m.streaming || m.error) continue;
    if (m.role === "user" && m.content) lastU = m;
    else if (m.role === "assistant" && m.content && lastU) {
      pairs.push({ q: lastU.content, a: m.content });
      lastU = null;
    }
  }
  if (pairs.length === 0) return { title: docTitle || "정책 변경 요청", body: "" };

  const recent = pairs.slice(-3);
  const clean = (s: string) =>
    s.replace(/\n+→\s*OK.*$/m, "").replace(/### 📋 변경 제안[\s\S]*$/m, "").trim();
  const firstQ = pairs[0].q.trim();
  const shortTitle = firstQ.replace(/[?!.]+$/, "").slice(0, 40);
  const body = [
    "## 상황",
    `- 문서: ${docTitle || "(미지정)"}`,
    `- 문의 요약: ${firstQ.replace(/\s+/g, " ").slice(0, 200)}`,
    "",
    "## 논의된 내용",
    ...recent.map(
      (p, i) =>
        `**Q${i + 1}.** ${p.q.replace(/\s+/g, " ").slice(0, 300)}\n**A${i + 1}.** ${clean(p.a).replace(/\s+/g, " ").slice(0, 500)}`,
    ),
    "",
    "## 요청 사항 (기획자 확인 필요)",
    "- 어느 정책 · 어느 절 · 어떻게 변경 → 여기 채워주세요",
    "- 근거 · 사유 → 여기 채워주세요",
  ].join("\n\n");
  return { title: shortTitle, body };
}

/** 대화 전체 Q/A 를 markdown 섹션으로 조립. 이미지 마크다운은 제거 (Claude 가 정책 md 이미지를
 *  답변에 옮겨 담는 경우 · planner 렌더 시 검은 박스로 표시되는 것 방지).
 *  변경 제안 블록 (### 📋 변경 제안) 은 이미 summary 에 반영됐으므로 답변에서 제거. */
export function buildConversationTranscript(messages: Message[]): string {
  const pairs: Array<{ q: string; a: string }> = [];
  let lastU: Message | null = null;
  for (const m of messages) {
    if (m.streaming || m.error) continue;
    if (m.role === "user" && m.content) lastU = m;
    else if (m.role === "assistant" && m.content && lastU) {
      pairs.push({ q: lastU.content, a: m.content });
      lastU = null;
    }
  }
  if (pairs.length === 0) return "";
  const stripImg = (s: string) => s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
  const stripProposal = (s: string) =>
    s.replace(/\n?```\s*\n?### 📋 변경 제안[\s\S]*?```/m, "").replace(/### 📋 변경 제안[\s\S]*$/m, "").trim();
  const blocks = pairs.map((p, i) => {
    const q = stripImg(p.q).trim();
    const a = stripImg(stripProposal(p.a)).trim();
    return `### Q${i + 1}\n\n${q}\n\n#### A${i + 1}\n\n${a}`;
  });
  return ["## 💬 대화 내역", "", blocks.join("\n\n---\n\n")].join("\n");
}

/** 답변 있으면 변경 제안 우선 · 없으면 fallback · 답변 없으면 빈 초안.
 *  두 경우 모두 body 하단에 실제 대화 내역 (Q/A) 를 자동 append — 기획자가 배경까지 볼 수 있게. */
export function buildForwardDraft(
  messages: Message[],
  docTitle: string,
): { title: string; body: string; hasProposal: boolean } {
  const transcript = buildConversationTranscript(messages);
  const appendTranscript = (body: string) =>
    transcript ? [body.trim(), "", "---", "", transcript].join("\n") : body;

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && !m.streaming && !m.error && m.content);
  if (lastAssistant) {
    const proposal = parseChangeProposal(lastAssistant.content);
    if (proposal) {
      const title =
        proposal.title ||
        `${docTitle} ${proposal.section}`.trim() ||
        docTitle ||
        "정책 변경 요청";
      return {
        title,
        body: appendTranscript(proposalToSummary(proposal)),
        hasProposal: true,
      };
    }
  }
  const fallback = buildFallbackSummary(messages, docTitle);
  return {
    ...fallback,
    body: appendTranscript(fallback.body),
    hasProposal: false,
  };
}
