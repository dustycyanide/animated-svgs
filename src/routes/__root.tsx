import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Animated SVGs" },
    ],
  }),
  shellComponent: RootDocument,
  component: Outlet,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <HydrationReadySignal />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function HydrationReadySignal() {
  useEffect(() => {
    const target = window as typeof window & { __animatedSvgsHydrated?: boolean };
    target.__animatedSvgsHydrated = true;
    window.dispatchEvent(new Event("animated-svgs:hydrated"));
  }, []);

  return null;
}
