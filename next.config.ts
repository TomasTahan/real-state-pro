import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Esta opción permite que el build continúe a pesar de los errores de TypeScript.
    ignoreBuildErrors: true,
  },
  cacheComponents: true,
};

export default nextConfig;
