import React, { useState } from 'react';

export default function Flashcard({ question, answer }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      style={{
        border: '2px solid #0b7285',
        padding: '20px',
        borderRadius: '8px',
        cursor: 'pointer',
        backgroundColor: isFlipped ? '#e6fcf5' : '#f8f9fa',
        margin: '15px 0'
      }}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <strong>{isFlipped ? "Answer:" : "Question:"}</strong>
      <p style={{ marginTop: '10px', fontSize: '1.1rem', color: '#495057' }}>
        {isFlipped ? answer : question}
      </p>
    </div>
  );
}