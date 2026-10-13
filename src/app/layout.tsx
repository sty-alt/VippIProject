import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Согласовано · Сметы на ремонт",
  description: "Понятная смета и решение клиента для вашей мастерской",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
