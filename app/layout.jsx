import './globals.css';
import Link from 'next/link';
import AuthProvider from '../components/AuthProvider';
import AuthButtons from '../components/AuthButtons';

export const metadata = {
  title: 'MindBridge X',
  description: 'Secure dashboard for building MCP-friendly mock APIs.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="shell">
            <header className="header">
              <Link className="brand" href="/">
                MindBridge X
              </Link>
              <AuthButtons />
            </header>
            <main className="main">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
