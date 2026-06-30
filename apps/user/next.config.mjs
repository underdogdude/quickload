/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@quickload/shared"],
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok-free.dev",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
