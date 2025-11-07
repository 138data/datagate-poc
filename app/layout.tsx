import './globals.css'

export const metadata = {
  title: 'DataGate 管理者',
  description: 'ログ管理システム',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
