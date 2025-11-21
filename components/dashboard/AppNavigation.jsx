'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/routes', label: 'Routes' },
  { href: '/mcp-servers', label: 'MCP Servers' },
  { href: '/account', label: 'Account' },
];

function isActive(pathname, href) {
  if (!pathname) return false;
  if (href === '/dashboard') {
    return pathname === '/' ? false : pathname.startsWith('/dashboard');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get('projectId');

  const buildHref = (href) => {
    if (!projectId) return href;
    const url = new URL(href, 'https://placeholder.local');
    url.searchParams.set('projectId', projectId);
    return `${url.pathname}${url.search ? url.search : ''}`;
  };

  return (
    <nav className="workspace-nav">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={buildHref(item.href)}
          className={`workspace-nav__link${isActive(pathname, item.href) ? ' is-active' : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
