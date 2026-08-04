import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 최소 이미지 생성 (server.js + 필수 node_modules 만 복사)
  output: "standalone",
};

export default nextConfig;
