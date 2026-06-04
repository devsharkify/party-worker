import "./globals.css";
import type { Metadata } from "next";
import { AdminAuthProvider } from "../src/admin-auth";

export const metadata: Metadata = {
  title: "Party Worker — HQ Admin",
  description: "Content studio, template designer, compliance gate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </body>
    </html>
  );
}
