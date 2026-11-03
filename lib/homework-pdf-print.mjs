export function openPdfDirectlyForPrint(type, url, userAgent, platform, maxTouchPoints) {
  const pdf = type === 'pdf' || /\.pdf(?:[?#]|$)/i.test(url)
  const iPad = /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
  return pdf && iPad
}
