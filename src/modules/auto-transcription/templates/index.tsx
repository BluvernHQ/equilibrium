"use client";

import { FC } from "react"
import AutoTranscription from "../section/auto-transcription"
import { useSession } from "@/context/SessionContext"

interface AutoTranscriptionTemplateProps {}

const AutoTranscriptionTemplate: FC<AutoTranscriptionTemplateProps> = () => {
  const { transcriptionData, isTranscribing, startTranscription, stopTranscription } = useSession();

  return (
    <div className=''>
      <AutoTranscription 
        transcriptionData={transcriptionData}
        isTranscribing={isTranscribing}
        onStartTranscription={startTranscription}
        onStopTranscription={stopTranscription}
      />
    </div>
  )
}

export default AutoTranscriptionTemplate
