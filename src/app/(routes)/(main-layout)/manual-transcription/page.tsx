import { Suspense } from "react";
import ManualTranscriptionTemplate from "@/modules/manual-transcription/templates";

export default function Page() {
  return (
    <Suspense>
      <ManualTranscriptionTemplate />
    </Suspense>
  );
}
