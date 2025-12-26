"use client";

import { useRouter } from "next/navigation";
import { ArrowUturnLeftIcon, HomeIcon } from "@heroicons/react/24/outline";

interface PageNotAvailableProps {
  pageName?: string;
}

export default function PageNotAvailable({ pageName }: PageNotAvailableProps) {
  const router = useRouter();

  return (
    <div className="relative flex flex-col items-center justify-center h-[100dvh] w-full bg-gray-50 overflow-hidden">
      {/* Background Decorative Blobs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#00A3AF]/10 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl -z-10" />

      {/* Main Card */}
      <div className="bg-white/80 backdrop-blur-sm p-10 rounded-3xl shadow-xl border border-white max-w-md w-full text-center transform transition-all hover:scale-[1.01] duration-500">
        
        {/* Animated Icon/Illustration */}
        <div className="mx-auto mb-6 w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center shadow-inner relative">
           <span className="text-5xl animate-bounce">🚧</span>
           <div className="absolute -bottom-2 -right-2 bg-[#00A3AF] text-white text-xs font-bold px-2 py-1 rounded-full border-2 border-white">
             404
           </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {pageName || "Page"} is under construction
        </h1>
        
        <p className="text-gray-500 mb-8 leading-relaxed">
          The <span className="font-semibold text-[#00A3AF]">{pageName || "requested page"}</span> isn't ready for the spotlight just yet. Our engineers are working hard to finish it.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 hover:border-gray-300 transition shadow-sm"
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            Go Back
          </button>
          
          <button
            onClick={() => router.push("/")}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#00A3AF] text-white rounded-xl font-medium shadow-md shadow-[#00A3AF]/20 hover:bg-[#008C97] hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <HomeIcon className="w-4 h-4" />
            Homepage
          </button>
        </div>
      </div>

      {/* Footer Text */}
      <p className="absolute bottom-6 text-xs text-gray-400 font-medium tracking-wide uppercase">
        System Status: Normal
      </p>
    </div>
  );
}