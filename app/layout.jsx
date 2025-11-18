import './globals.css';
import AuthProvider from '../components/AuthProvider';

export const metadata = {
  title: 'MindBridge X',
  description: 'Secure dashboard for building MCP-friendly mock APIs.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
