import { FC } from "react"
import ManualTranscription from "../section/manual-transcription"

interface ManualTranscriptionTemplateProps {}

const ManualTranscriptionTemplate: FC<ManualTranscriptionTemplateProps> = () => {
  return (
    <div className=''>
      <ManualTranscription />
    </div>
  )
}

export default ManualTranscriptionTemplate
