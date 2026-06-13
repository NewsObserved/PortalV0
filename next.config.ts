import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The runner reads prompts/editorial-system-prompt.md at runtime; keep it traceable.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**"],
  },
};

export default nextConfig;
