import { FC } from "react"
import Sessions from "../section/sessions"

interface SessionsTemplateProps { }

const SessionsTemplate: FC<SessionsTemplateProps> = () => {
  return (
    <div className=''>
      <Sessions />
    </div>
  )
}

export default SessionsTemplate
