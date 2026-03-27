import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Michele Mauri — mcmr-tech',
  description: 'Standalone technical portfolio with morphic particle animation.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
