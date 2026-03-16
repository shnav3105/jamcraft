import { useState, useEffect, useRef } from 'react'
import './Chat.css'

export default function Chat({ messages, onSend, myName }) {
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }

  return (
    <div className="pbox chat">
      <div className="chat-header">CHAT</div>
      <div className="chat-messages">
        {messages.map(m => (
          <div key={m.id} className={`chat-msg ${m.system ? 'system' : ''}`}>
            {!m.system && (
              <span className={`who ${m.who === myName ? 'you' : ''}`}>{m.who}: </span>
            )}
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <input
          className="pixel-input"
          placeholder="SAY SOMETHING..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button className="btn" onClick={send}>▶</button>
      </div>
    </div>
  )
}