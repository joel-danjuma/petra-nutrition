import Link from 'next/link';

// Only destinations that exist. The prototype also lists Product tour, Mobile
// app, Writing, Careers, Contact and Cookies; add them here when they do.
const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/platform', label: 'Platform' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  { title: 'Company', links: [{ href: '/about', label: 'About' }] },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-container px-gutter py-[clamp(40px,5vw,64px)]">
        <div className="grid grid-auto-200 gap-fluid-lg">
          <div>
            <p className="m-0 text-title-sm font-medium text-ink">Petra</p>
            <p className="m-0 mt-sm max-w-[34ch] text-body-md leading-relaxed text-muted-foreground">
              Your pantry, tracked. Your recipes, generated from it.
            </p>
          </div>
          {COLUMNS.map(col => (
            <div key={col.title}>
              <p className="m-0 mb-3.5 text-body-md font-medium text-ink">
                {col.title}
              </p>
              <ul className="m-0 flex list-none flex-col items-start gap-2.5 p-0">
                {col.links.map(l => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="rounded-sm text-body-md text-muted-foreground active:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-xxl flex flex-wrap justify-between gap-sm border-t border-border pt-lg">
          <p className="m-0 text-label-sm text-muted-foreground">
            © {new Date().getFullYear()} Petra
          </p>
          <p className="m-0 text-label-sm text-muted-foreground">
            Made for people who cook on weeknights.
          </p>
        </div>
      </div>
    </footer>
  );
}
