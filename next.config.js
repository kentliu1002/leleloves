/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'  // 允许手机拍的作业照片（默认 1MB 会让多张照片打卡失败）
    }
  }
};
module.exports = nextConfig;