import { cn } from "../lib/cn";

export interface SiteFooterProps {
  productName: string;
  className?: string;
}

/**
 * Site footer. Carries the attribution the game's content requires:
 * this is a fan project, and the data comes from Albion's public API.
 */
export function SiteFooter({ productName, className }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "mt-12 border-t border-neutral-200 py-8 dark:border-neutral-800",
        className,
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        <p>
          {productName} is not affiliated with or endorsed by Sandbox Interactive GmbH, the
          creators of Albion Online.
        </p>
        <p>
          Data from the public{" "}
          <a
            href="https://www.albiononline.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-amber-600 dark:hover:text-amber-400"
          >
            Albion Online
          </a>{" "}
          API. Item art from Albion&apos;s render service.
        </p>
      </div>
    </footer>
  );
}
