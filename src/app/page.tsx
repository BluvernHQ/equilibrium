"use client";

import { useState, useEffect, useMemo } from "react";
import MainLayout from "./(routes)/(main-layout)/layout";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRightIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

// New Components
import AutoTranscription from "@/modules/auto-transcription/section/auto-transcription";
import ManualTranscription from "@/modules/manual-transcription/section/manual-transcription";

export default function Home() {
  const { file, mediaUrl, transcriptionData, isTranscribing, startTranscription, resetSession } = useSession();
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');

  // Helper to map Auto Transcript to Manual Format
  const manualProps = useMemo(() => {
    if (!transcriptionData) return { initialTranscript: [], initialSpeakers: [] };

    // 1. Extract Unique Speakers
    const uniqueSpeakers = Array.from(new Set(transcriptionData.map(t => t.name)));
    const initialSpeakers = uniqueSpeakers.map((name, index) => ({
      id: `spk-${index}`,
      name: name,
      shortName: name,
      avatar: "/icons/profile-circle.png", // Use default icon
      isDefault: false,
      role: 'speaker' as const
    }));

    // 2. Map Segments
    const initialTranscript = transcriptionData.map((t, index) => {
      // Find matching speaker ID
      const spkId = initialSpeakers.find(s => s.name === t.name)?.id || null;

      return {
        id: `seg-${index}`,
        selectedSpeakerId: spkId,
        timestamp: t.time,
        content: t.text
      };
    });

    return { initialTranscript, initialSpeakers };
  }, [transcriptionData]);

  // If session is active (file uploaded), render the Workspace Views
  if (file && mediaUrl) {
    return (
      <MainLayout>
        {/* Custom Tab Navigation Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center justify-center gap-4 shadow-sm z-40 relative sticky top-0">
          <button
            onClick={() => setActiveTab('auto')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'auto'
              ? 'bg-[#00A3AF] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
              }`}
          >
            Auto Transcription
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'manual'
              ? 'bg-[#00A3AF] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
              }`}
          >
            Manual Tool
          </button>

          <button
            onClick={resetSession}
            className="absolute right-6 text-xs text-gray-400 hover:text-red-500 underline"
          >
            Exit Session
          </button>
        </div>

        {/* Content Area */}
        <div className="relative">
          {activeTab === 'auto' ? (
            // If we have data, show it. If not, show the "Start Transcription" empty state inside AutoTranscription or wrapping it here.
            // Let's handle the "Ready to Transcribe" state here for clarity.
            !transcriptionData ? (
              <AutoTranscription
                transcriptionData={null}
                audioUrl={mediaUrl}
                isTranscribing={isTranscribing}
                onStartTranscription={startTranscription}
              />
            ) : (
              <AutoTranscription
                transcriptionData={transcriptionData}
                audioUrl={mediaUrl}
                isTranscribing={isTranscribing}
                onStartTranscription={startTranscription}
              />
            )
          ) : (
            <ManualTranscription
              audioUrl={mediaUrl}
              initialTranscript={manualProps.initialTranscript}
              initialSpeakers={manualProps.initialSpeakers}
            />
          )}
        </div>
      </MainLayout>
    );
  }

  // DEFAULT LANDING PAGE
  return (
    <MainLayout>
      <div className="relative min-h-[calc(110vh-64px)] flex items-center bg-gray-50 overflow-hidden">

        {/* Abstract Background Shapes */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#00A3AF]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-200/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

        <div className="container mx-auto px-6 flex items-center justify-center relative z-10">

          {/* Content: Text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl"
          >
            <div className="inline-block px-3 py-1 mb-6 text-xs font-semibold tracking-wider text-[#00A3AF] uppercase bg-[#00A3AF]/10 rounded-full">
              Equilibrium collab
            </div>

            <h1 className="text-5xl lg:text-6xl font-extrabold text-[#111827] leading-tight mb-6">
              Balance your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A3AF] to-[#007f8a]">
                Collaboration.
              </span>
            </h1>

            <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto leading-relaxed">
              Experience the future of project management. Real-time sessions, auto-generated notes, and precise manual transcriptions in one workspace.
            </p>

            {/* BUTTON GROUP */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
              <Link href="/sessions" className="group flex items-center justify-center gap-2 bg-[#111827] text-white px-6 py-3.5 rounded-xl font-medium shadow-lg hover:shadow-xl hover:bg-black transition-all">
                Tags
                <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link href="/auto-transcription" className="group flex items-center justify-center gap-2 bg-[#00A3AF] text-white px-6 py-3.5 rounded-xl font-medium shadow-lg hover:bg-[#008C97] hover:shadow-xl transition-all">
                Auto Transcription
                <SparklesIcon className="w-4 h-4" />
              </Link>

              <Link href="/manual-transcription" className="flex items-center justify-center gap-2 bg-white text-gray-700 border border-[#00A3AF] px-6 py-3.5 rounded-xl font-medium hover:bg-gray-50 transition-all">
                Manual Tool
              </Link>
            </div>
          </motion.div>

        </div>
      </div>
    </MainLayout>
  );
}