"use client";
import { isValidElement, ReactNode, createElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** 정책 문서 링크 여부 판별 · `projects/**` 또는 `qa/**` 하위 `.md` */
function isInternalDocPath(href: string | undefined): boolean {
  if (!href) return false;
  if (href.startsWith("http://") || href.startsWith("https://")) return false;
  if (href.startsWith("mailto:")) return false;
  if (href.startsWith("#cite-")) return false;
  return /\.md(#[^?]*)?$/i.test(href);
}

/** 답변 마크다운에서 "§X-Y" 를 `[§X-Y](#cite-X-Y)` 로 자동 링크화.
 *  코드블록·인라인코드·기존 markdown 링크 안은 건드리지 않음. */
function autoLinkCitations(md: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < md.length) {
    if (md.slice(i, i + 3) === "```") {
      const end = md.indexOf("```", i + 3);
      const stop = end === -1 ? md.length : end + 3;
      out.push(md.slice(i, stop));
      i = stop;
      continue;
    }
    if (md[i] === "`") {
      const end = md.indexOf("`", i + 1);
      const stop = end === -1 ? md.length : end + 1;
      out.push(md.slice(i, stop));
      i = stop;
      continue;
    }
    if (md[i] === "[" || (md[i] === "!" && md[i + 1] === "[")) {
      const link = /^!?\[[^\]]*\]\([^)]*\)/.exec(md.slice(i));
      if (link) {
        out.push(link[0]);
        i += link[0].length;
        continue;
      }
    }
    const cite = /^§\s*(\d+(?:-\d+)*)/.exec(md.slice(i));
    if (cite) {
      out.push(`[§${cite[1]}](#cite-${cite[1]})`);
      i += cite[0].length;
      continue;
    }
    out.push(md[i]);
    i++;
  }
  return out.join("");
}

/** 헤딩 children 에서 텍스트 추출 후 "N-M" 패턴이면 id="cite-N-M" 부여. */
function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) return extractText((node.props as { children?: ReactNode }).children);
  return "";
}

function citeIdOf(children: ReactNode): string | undefined {
  const text = extractText(children).trim();
  const m = text.match(/^(?:§\s*)?(\d+(?:-\d+)*)\.?\s/);
  return m ? `cite-${m[1]}` : undefined;
}

/** AI 답변용 마크다운 렌더러. GFM 지원 (table · task list · strikethrough).
 *  - 내부 문서 경로 링크 (projects/**.md) 는 target=_blank 대신 onDocLink 콜백으로 처리.
 *  - §X-Y 인용은 클릭 시 onCitation 콜백 (도큐 뷰어 스크롤용). */
export function MarkdownView({
  content,
  onDocLink,
  onCitation,
  assignHeadingIds,
  stripImages,
  stripChangeProposal,
  onEditPlannerNote,
}: {
  content: string;
  /** 내부 문서 링크 클릭 콜백. path 는 fragment 없는 경로, hash 는 있으면 '#4-2-1' 형태 */
  onDocLink?: (path: string, hash?: string) => void;
  /** §X-Y 인용 클릭 콜백 · 도큐 뷰어에서 해당 섹션으로 스크롤 */
  onCitation?: (anchor: string) => void;
  /** 정책문서 렌더러용 · 헤딩에 id="cite-X-Y" 부여 (챗 답변의 §X-Y 링크 타겟) */
  assignHeadingIds?: boolean;
  /** AI 답변 렌더링용 · true 면 이미지 마크다운 (`![](...)`) 을 안전하게 텍스트로 대체.
   *  · 정책 문서 안 이미지 링크가 답변에 딸려 나오는 것을 프론트에서 방어. */
  stripImages?: boolean;
  /** AI 답변 렌더링용 · true 면 「### 📋 변경 제안」 블록을 화면에서 숨김.
   *  · 이 블록은 파싱 전용 (기획전달 초안 채우기) 이라 사용자에게 노출 불필요.
   *  · 원문 content 는 그대로 · parseChangeProposal 은 정상 동작. */
  stripChangeProposal?: boolean;
  /** 있으면 planner-note (기획자 메모) 박스 우측 상단에 ✏️ 아이콘 노출 · 클릭 시 호출.
   *  · 기획자 페이지에서만 넘김 (질문자 뷰어에선 편집 UI 감춤). */
  onEditPlannerNote?: () => void;
}) {
  let rawContent = content;
  if (stripChangeProposal) {
    // fenced form: ```...### 📋 변경 제안...```
    rawContent = rawContent.replace(/```[a-zA-Z]*\s*\n?[\s\S]*?### 📋 변경 제안[\s\S]*?\n?```\s*/g, "");
    // bare form: ### 📋 변경 제안 ... (until next ## / ### heading or end)
    rawContent = rawContent.replace(/### 📋 변경 제안[\s\S]*?(?=\n##\s|\n###\s|$)/g, "").trimEnd();
  }
  if (stripImages) {
    rawContent = rawContent
      // ![alt](url "title") — 표준 markdown 이미지
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
      // ![alt][ref] — reference-style
      .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "")
      // <img ...> · <img ... /> · HTML 이미지 태그
      .replace(/<img\b[^>]*>/gi, "");
  }
  const processed = onCitation ? autoLinkCitations(rawContent) : rawContent;
  const headingRenderer = assignHeadingIds
    ? (level: 1 | 2 | 3 | 4 | 5 | 6) =>
        function Heading({ children }: { children?: ReactNode }) {
          return createElement(`h${level}`, { id: citeIdOf(children) }, children);
        }
    : undefined;
  return (
    <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-pre:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:text-xs prose-code:text-[13px] prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-a:text-indigo-600 prose-blockquote:border-l-indigo-300 prose-blockquote:text-slate-600 prose-blockquote:not-italic prose-img:rounded prose-img:my-2 prose-hr:my-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // stripImages=true 시 최종 방어선 · remark/rehype 를 통과한 어떤 img 도 렌더 X.
          ...(stripImages ? { img: () => null } : {}),
          a: ({ href, children }) => {
            if (onCitation && href?.startsWith("#cite-")) {
              const anchor = href.slice("#cite-".length);
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    onCitation(anchor);
                  }}
                  className="!text-indigo-700 !font-medium underline decoration-indigo-300 hover:decoration-indigo-500"
                  title={`문서 §${anchor} 위치로 이동`}
                >
                  {children}
                </a>
              );
            }
            if (onDocLink && isInternalDocPath(href)) {
              const url = href!;
              const hashIdx = url.indexOf("#");
              const path = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
              const hash = hashIdx >= 0 ? url.slice(hashIdx) : undefined;
              return (
                <a
                  href={`#${path}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onDocLink(path, hash);
                  }}
                  className="!text-indigo-700 !font-medium underline decoration-indigo-300 hover:decoration-indigo-500"
                  title={`문서 열기: ${path}${hash ?? ""}`}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          ...(headingRenderer && {
            h1: headingRenderer(1),
            h2: headingRenderer(2),
            h3: headingRenderer(3),
            h4: headingRenderer(4),
            h5: headingRenderer(5),
            h6: headingRenderer(6),
          }),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="border-collapse text-[13px] !w-auto !m-0 border border-slate-300 bg-white">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-300 px-3 py-1.5 bg-slate-100 text-left font-semibold text-slate-700 align-top">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-300 px-3 py-1.5 align-top">{children}</td>
          ),
          // blockquote 는 기본 회색 스타일 · 첫 텍스트에 `[planner-note:apply|hold]` 마커가 있으면 초록/앰버 박스로 특수 렌더링.
          blockquote: ({ children }) => {
            const kind = detectPlannerNoteKind(children);
            if (kind) {
              const stripped = stripPlannerNoteMarker(children);
              const cls = kind === "apply"
                ? "border-emerald-300 bg-emerald-50"
                : "border-amber-300 bg-amber-50";
              const btnCls = kind === "apply"
                ? "text-emerald-700 hover:bg-emerald-100"
                : "text-amber-700 hover:bg-amber-100";
              return (
                <div className={`relative my-3 rounded-lg border-2 p-3 ${cls}`}>
                  {onEditPlannerNote && (
                    <button
                      type="button"
                      onClick={onEditPlannerNote}
                      title={kind === "apply" ? "적용 메모 수정" : "보류 사유 수정"}
                      className={`absolute top-2 right-2 h-6 w-6 rounded inline-flex items-center justify-center transition-colors ${btnCls}`}
                    >
                      ✏️
                    </button>
                  )}
                  {stripped}
                </div>
              );
            }
            return <blockquote>{children}</blockquote>;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

/** blockquote children 첫 텍스트에서 `[planner-note:apply|hold]` 마커 탐지. */
function detectPlannerNoteKind(children: ReactNode): "apply" | "hold" | null {
  const text = extractText(children);
  if (/\[planner-note:apply\]/.test(text)) return "apply";
  if (/\[planner-note:hold\]/.test(text)) return "hold";
  return null;
}

/** blockquote children 에서 `[planner-note:xxx]` 마커 텍스트를 제거 (표시하지 않기 위함).
 *  · react element 트리를 순회하며 string 안 마커를 제거한 사본을 반환. */
function stripPlannerNoteMarker(node: ReactNode): ReactNode {
  const RE = /\s*\[planner-note:(?:apply|hold)\]\s*/g;
  const walk = (n: ReactNode): ReactNode => {
    if (typeof n === "string") return n.replace(RE, "");
    if (typeof n === "number") return n;
    if (Array.isArray(n)) return n.map((c, i) => <span key={i}>{walk(c)}</span>);
    if (isValidElement(n)) {
      const el = n as React.ReactElement<{ children?: ReactNode }>;
      const kids = el.props.children;
      return createElement(el.type as string, { ...el.props, key: (el as { key?: string | null }).key ?? undefined }, walk(kids));
    }
    return n;
  };
  return walk(node);
}
