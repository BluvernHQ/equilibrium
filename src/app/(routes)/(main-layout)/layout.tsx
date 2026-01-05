import Sidebar from "@/components/Sidebar/Sidebar";
// app/layout.tsx or pages/_app.tsx
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
// import "./globals.css"; // your normal global css

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar />
      <main className="flex-1 ml-[72px]">{children}</main>
    </div>
  );
}
