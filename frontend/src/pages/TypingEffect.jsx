import React, { useState, useEffect } from 'react';

const TypingEffect = ({ text, speed = 5000, deleteSpeed = 0, pauseTime = 5000 }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [typingSpeed, setTypingSpeed] = useState(speed);

  useEffect(() => {
    const handleType = () => {
      const fullText = text;
      const currentText = isDeleting
        ? fullText.substring(0, displayedText.length - 1)
        : fullText.substring(0, displayedText.length + 1);

      setDisplayedText(currentText);

      if (isDeleting) {
        setTypingSpeed(deleteSpeed);
      }

      // If typing is complete
      if (!isDeleting && currentText === fullText) {
        // Pause for a moment, then start deleting
        setTypingSpeed(pauseTime);
        setIsDeleting(true);
      } 
      // If deleting is complete
      else if (isDeleting && currentText === '') {
        // Reset and start typing again
        setIsDeleting(false);
        setLoopNum(loopNum + 1);
        setTypingSpeed(speed);
      }
    };

    const timer = setTimeout(handleType, typingSpeed);

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, loopNum, text, speed, deleteSpeed, pauseTime, typingSpeed]);

  return (
    <span className="font-mono text-sm text-black-600">
      {displayedText}
      {/* Blinking cursor effect */}
      <span className="inline-block w-1 h-4 bg-gray-600 ml-1 align-middle animate-pulse"></span>
    </span>
  );
};

export default TypingEffect;
