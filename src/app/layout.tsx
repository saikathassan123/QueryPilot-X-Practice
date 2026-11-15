import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QueryPilot",
  description: "A workspace for connected data analysis and monitoring."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
