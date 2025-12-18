import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Village of Voices - AI NPC Game",
  description: "A Pokemon/Stardew Valley style game where all NPCs are LLM voice AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
