import { FC, Suspense } from "react"
import Sessions from "../section/sessions"

interface SessionsTemplateProps { }

const SessionsTemplate: FC<SessionsTemplateProps> = () => {
  return (
    <div className='h-full flex flex-col'>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-gray-500">Loading...</div></div>}>
        <Sessions />
      </Suspense>
    </div>
  )
}

export default SessionsTemplate
