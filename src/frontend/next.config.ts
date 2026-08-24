import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 최소 이미지 생성 (server.js + 필수 node_modules 만 복사)
  output: "standalone",

  // /api/* 프록시 body 상한 (기본 10MB) — 이미지 첨부 다중 업로드 대비 30MB.
  // 실제 이미지는 프론트에서 축소하지만, 안전 마진.
  experimental: {
    proxyClientMaxBodySize: "30mb",
  },

  // /api/* 요청을 백엔드 컨테이너로 서버측 프록시.
  // 사용자는 http://localhost:3001 하나만 사용 · 브라우저 CORS 이슈 없음.
  // BACKEND_INTERNAL_URL: Docker 내부 http://backend:3000 (기본)
  //                       로컬 dev (docker 없이) http://localhost:3000
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
