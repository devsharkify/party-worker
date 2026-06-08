import "./globals.css";
import type { Metadata } from "next";
import { AdminAuthProvider } from "../src/admin-auth";
import { ToastProvider } from "../src/ui";

export const metadata: Metadata = {
  title: "myTRS — HQ Admin",
  description: "Content studio, template designer, compliance gate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AdminAuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AdminAuthProvider>
      </body>
    </html>
  );
}
