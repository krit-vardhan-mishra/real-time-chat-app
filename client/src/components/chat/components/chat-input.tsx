
import { useRef, useCallback, useEffect } from "react";
import { type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smile, Paperclip, Send, Mic } from "lucide-react";

interface ChatInputProps {
  messageInput: string;
  setMessageInput: (input: string) => void;
  handleSend: () => void;
  disabled?: boolean;
  disabledMessage?: string;
  socket?: Socket | null;
  conversationId?: number | null;
}

export default function ChatInput({
  messageInput,
  setMessageInput,
  handleSend,
  disabled = false,
  disabledMessage,
  socket,
  conversationId,
}: ChatInputProps) {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Emit typing stop when component unmounts or conversation changes
  useEffect(() => {
    return () => {
      if (isTypingRef.current && socket && conversationId) {
        socket.emit("typing", { conversationId, isTyping: false });
        isTypingRef.current = false;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [socket, conversationId]);

  const handleTyping = useCallback(() => {
    if (!socket || !conversationId || disabled) return;

    // Emit typing start if not already typing
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("typing", { conversationId, isTyping: true });
    }

    // Reset the stop-typing timer
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socket.emit("typing", { conversationId, isTyping: false });
      }
    }, 2000);
  }, [socket, conversationId, disabled]);

  const handleInputChange = (value: string) => {
    setMessageInput(value);
    if (value.trim()) {
      handleTyping();
    } else if (isTypingRef.current && socket && conversationId) {
      // Input cleared — stop typing immediately
      isTypingRef.current = false;
      socket.emit("typing", { conversationId, isTyping: false });
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleSendWithTypingStop = () => {
    // Stop typing indicator when sending a message
    if (isTypingRef.current && socket && conversationId) {
      isTypingRef.current = false;
      socket.emit("typing", { conversationId, isTyping: false });
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
    handleSend();
  };

  return (
    <div className="min-h-[56px] sm:min-h-[62px] bg-[#161B22] border-t border-[#30363D] flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="text-gray-400 hover:text-[#C9D1D9] hover:bg-[#30363D] h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 hidden xs:flex"
        title="Emoji"
      >
        <Smile className="w-5 h-5 sm:w-6 sm:h-6" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-gray-400 hover:text-[#C9D1D9] hover:bg-[#30363D] h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 hidden xs:flex"
        title="Attach File"
      >
        <Paperclip className="w-5 h-5 sm:w-6 sm:h-6" />
      </Button>
      <Input
        placeholder={disabled && disabledMessage ? disabledMessage : "Type a message"}
        value={messageInput}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={(e) => !disabled && e.key === "Enter" && handleSendWithTypingStop()}
        disabled={disabled}
        className="flex-1 bg-[#0D1117] border border-[#30363D] text-[#C9D1D9] placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-[#238636] rounded-lg h-9 sm:h-10 text-sm sm:text-base"
      />
      {messageInput.trim() ? (
        <Button
          onClick={handleSendWithTypingStop}
          disabled={disabled}
          size="icon"
          className="bg-[#238636] hover:bg-[#238636]/90 text-white rounded-full h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
          title="Send Message"
        >
          <Send className="w-4 h-4 sm:w-5 sm:h-5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="text-gray-400 hover:text-[#C9D1D9] hover:bg-[#30363D] h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
          title="Record Voice Message"
        >
          <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
        </Button>
      )}
    </div>
  );
}

