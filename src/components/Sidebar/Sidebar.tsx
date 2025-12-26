"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const menuItems = [
  { id: 1, label: "Home", icon: "/icons/home.png", path: "/" },
  { id: 2, label: "Dashboard", icon: "/icons/Group.png", path: "/dashboard" },
  { id: 3, label: "Recordings", icon: "video", path: "/recordings" }, // Custom SVG icon
  { id: 4, label: "User Tick", icon: "/icons/user-tick.png", path: "/user-tick" },
  { id: 5, label: "Documents", icon: "/icons/document.png", path: "/documents" },
  { id: 6, label: "Settings", icon: "/icons/Frame.png", path: "/settings" },
  { id: 7, label: "User", icon: "/icons/user.png", path: "/user" },
  { id: 8, label: "Users", icon: "/icons/users.png", path: "/users" },
  { id: 9, label: "Pen Tool", icon: "/icons/pen.png", path: "/pen-tool" },
];

export default function Sidebar() {
  const [active, setActive] = useState(1);
  const router = useRouter();
  const pathname = usePathname();

  // Update active state based on current pathname
  useEffect(() => {
    const currentItem = menuItems.find((item) => item.path === pathname);
    if (currentItem) {
      setActive(currentItem.id);
    }
  }, [pathname]);

  const handleMenuClick = (item: any) => {
    setActive(item.id);
    if (item.path) {
      router.push(item.path);
    }
  };

  return (
    <aside className="w-[72px] h-screen bg-[#111827] flex flex-col justify-between items-center py-5">

      {/* Top logo */}
      <div className="flex flex-col items-center gap-6">
        <div className="w-[40px] h-[40px] relative flex justify-center items-center">
          <div className="absolute w-[35px] h-[35px] bg-[#00A3AF] rounded-full flex items-center justify-center">
            <div className="w-[19px] h-[19px] bg-white rounded-full" />
          </div>
        </div>

        {/* Menu */}
        <div className="flex flex-col gap-6">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item)}
              className={`w-[40px] h-[40px] flex items-center justify-center rounded-[10px] transition
                ${active === item.id ? "bg-white/10" : "bg-transparent"}
              `}
              title={item.label}
            >
              {item.icon === "video" ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ color: active === item.id ? "#ffffff" : "#9CA3AF" }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              ) : (
                <Image
                  src={item.icon}
                  alt={item.label}
                  width={20}
                  height={20}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Profile */}
      <div className="w-[40px] h-[40px] rounded-full overflow-hidden">
        <Image src="/images/user.png" alt="User" width={40} height={40} />
      </div>
    </aside>
  );
}
