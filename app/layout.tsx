export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#0B0B0D', color: '#EAEAEA', fontFamily: 'Inter, sans-serif' }}>{children}</body>
    </html>
  );
}
