import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WannaSong',
  description: '누구나 신청하고 스피커 PC 한 대가 YouTube로 재생하는 실시간 주크박스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
