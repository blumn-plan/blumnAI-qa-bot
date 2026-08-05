"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** AI 답변용 마크다운 렌더러. GFM 지원 (table · task list · strikethrough).
 *  코드 블록 · 링크 · 인용문 스타일링 · 이미지 responsive. */
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-pre:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:text-xs prose-code:text-[13px] prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-a:text-indigo-600 prose-blockquote:border-l-indigo-300 prose-blockquote:text-slate-600 prose-blockquote:not-italic prose-img:rounded prose-img:my-2 prose-hr:my-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-300 px-2 py-1 bg-slate-100 text-left">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-300 px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
