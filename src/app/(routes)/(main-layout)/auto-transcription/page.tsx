import { Suspense } from "react";
import AutoTranscriptionTemplate from "@/modules/auto-transcription/templates";

export default function Page() {
  return (
    <Suspense>
      <AutoTranscriptionTemplate />
    </Suspense>
  );
}
