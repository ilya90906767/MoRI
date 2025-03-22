import { useState, useRef } from 'react'
import './ChatInput.css'

const ChatInput = ({ onSubmit, disabled, onFileUpload, awaitingOrganInput }) => {
  const [message, setMessage] = useState('')
  const fileInputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!message.trim() || disabled) return
    onSubmit(message)
    setMessage('')
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      onFileUpload(file)
      e.target.value = '' // Reset file input
    }
  }

  return (
    <form className="chat-input-container" onSubmit={handleSubmit}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept=".jpg,.jpeg,.png,.pdf,.dcm"
      />
      <button
        type="button"
        className="upload-button"
        onClick={() => fileInputRef.current.click()}
        disabled={disabled || awaitingOrganInput}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 15V3M12 3L7 8M12 3L17 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M3 12V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={awaitingOrganInput 
          ? "Please specify the organ or system (e.g., brain, heart, lungs...)" 
          : "Type your message..."}
        disabled={disabled}
        className={awaitingOrganInput ? 'awaiting-input' : ''}
      />
      <button 
        type="submit" 
        disabled={!message.trim() || disabled}
        className={awaitingOrganInput ? 'confirm-button' : ''}
      >
        {awaitingOrganInput ? 'Confirm' : 'Send'}
      </button>
    </form>
  )
}

export default ChatInput 