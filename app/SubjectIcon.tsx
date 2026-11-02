import React from 'react'

const icons: Record<string, React.ReactNode> = {
  '语文': <><path d="M32 18C26 12 18 11 8 13v36c10-2 18-1 24 5 6-6 14-7 24-5V13c-10-2-18-1-24 5Z" fill="#f6d58d" stroke="#ffedb4" strokeWidth="2.5"/><path d="M32 18v36M13 20c6-1 11 0 15 3m-15 5c6-1 11 0 15 3m8-8c4-3 9-4 15-3m-15 11c4-3 9-4 15-3" fill="none" stroke="#b68045" strokeWidth="2" strokeLinecap="round"/><path d="M40 11h7v15l-3.5-3-3.5 3z" fill="#ff6b6b"/></>,
  '数学': <><path d="M10 50 48 10v40Z" fill="#ffc83d" stroke="#ffe37d" strokeWidth="3" strokeLinejoin="round"/><path d="M31 43h10V32Z" fill="#172556"/><path d="m39 17 4 4m-10 2 4 4m-10 2 4 4m-10 2 4 4" stroke="#946618" strokeWidth="2" strokeLinecap="round"/></>,
  '英语': <><rect x="9" y="11" width="46" height="42" rx="8" fill="#58a7f5" stroke="#a6d9ff" strokeWidth="2.5"/><path d="M15 45h34" stroke="#2869bd" strokeWidth="2"/><text x="32" y="37" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="800" fontFamily="sans-serif">ABC</text></>,
  '科学': <><path d="M26 10h12m-9 0v16L16 46a6 6 0 0 0 5 9h22a6 6 0 0 0 5-9L35 26V10" fill="#5ed5c2" stroke="#c5fff2" strokeWidth="3" strokeLinejoin="round"/><path d="M21 41h22l5 7a4 4 0 0 1-4 7H20a4 4 0 0 1-4-7Z" fill="#278f96"/><circle cx="29" cy="38" r="2.5" fill="#d7fff4"/><circle cx="36" cy="44" r="2" fill="#d7fff4"/></>,
  '历史': <><path d="M15 14c0-4 3-6 7-6h25v42H22c-4 0-7 2-7 5Zm0 0v36c0 3 3 5 7 5h27" fill="#e9c887" stroke="#ffe5b4" strokeWidth="3" strokeLinejoin="round"/><path d="M25 19h15m-15 7h15m-15 7h10" stroke="#a7703c" strokeWidth="2.5" strokeLinecap="round"/><circle cx="44" cy="44" r="8" fill="#f39b42" stroke="#ffda87" strokeWidth="2"/></>,
  '地理': <><circle cx="32" cy="29" r="21" fill="#459eef" stroke="#a9d9ff" strokeWidth="3"/><path d="m18 19 8-6 6 3-2 6-6 2-2 7-6-2Zm19-6 8 5 1 6-5 2-5-3-4 2 1-7Zm-4 19 8-3 6 4-3 7-5 1-3 8-4-4 1-7-4-3Z" fill="#8ee39e"/><path d="M22 55h20m-10-5v5" stroke="#f4d77a" strokeWidth="3" strokeLinecap="round"/></>,
  '政治': <><path d="M32 10v41M14 21h36M19 21l-8 15h16l-8-15Zm26 0-8 15h16l-8-15ZM23 53h18" fill="none" stroke="#ffe6a5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M11 36c1 5 15 5 16 0m10 0c1 5 15 5 16 0" fill="#ffc34d" stroke="#ffd980" strokeWidth="2"/></>,
  '其它': <><path d="M16 9h25l9 9v36H16Z" fill="#d3e4ff" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round"/><path d="M41 9v10h9M23 27h20m-20 7h20m-20 7h14" fill="none" stroke="#6688ba" strokeWidth="2.5" strokeLinecap="round"/></>,
}

export default function SubjectIcon({ subject }: { subject: string }) {
  return <svg className="subject-icon-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">{icons[subject] || icons['其它']}</svg>
}
