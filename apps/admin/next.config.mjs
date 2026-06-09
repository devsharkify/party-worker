/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@pw/shared"],
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
