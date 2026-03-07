import { useState, useEffect, useMemo } from "react";
import { type Socket } from "socket.io-client";
import { genConfig } from "react-nice-avatar";
import SelectedUserProfile from "./selected-user-profile";
import Conversation from "@/data/conversation";
import Message from "@/data/message";
import ChatHeader from "./components/chat-header";
import ChatInput from "./components/chat-input";
import ChatMessageArea from "./components/chat-message-area";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: Message[];
  currentUserId: number;
  onSendMessage: (content: string) => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onBack?: () => void;
  showBackButton?: boolean;
  isLoadingMessages?: boolean;
  onlineUsers?: Set<number>;
  onStartVideoCall?: (toUserId: number) => void;
  onStartAudioCall?: (toUserId: number) => void;
  isOtherUserTyping?: boolean;
  socket?: Socket | null;
  conversationId?: number | null;
}

export default function ChatArea({
  conversation,
  messages,
  currentUserId,
  onSendMessage,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  onBack,
  showBackButton = false,
  isLoadingMessages = false,
  onlineUsers = new Set(),
  onStartVideoCall,
  onStartAudioCall,
  isOtherUserTyping = false,
  socket,
  conversationId,
}: ChatAreaProps) {
  const [messageInput, setMessageInput] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [isMessageSearchMode, setIsMessageSearchMode] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");

  // Reset message search when conversation changes
  useEffect(() => {
    setIsMessageSearchMode(false);
    setMessageSearchQuery("");
  }, [conversation]);

  const handleSend = () => {
    if (messageInput.trim()) {
      onSendMessage(messageInput);
      setMessageInput("");
    }
  };

  const handleToggleMessageSearch = () => {
    setIsMessageSearchMode(prev => {
      if (prev) {
        setMessageSearchQuery("");
      }
      return !prev;
    });
  };

  const handleClearMessageSearch = () => {
    setMessageSearchQuery("");
    setIsMessageSearchMode(false);
  }

  // Compute participants and states with stable hooks (never inside conditionals)
  const other = useMemo(
    () => conversation?.participants.find((p) => p.id !== currentUserId),
    [conversation, currentUserId]
  );

  const me = useMemo(
    () => conversation?.participants.find((p) => p.id === currentUserId),
    [conversation, currentUserId]
  );

  const isPendingForMe = me?.state === 'pending';
  const otherIsPending = other?.state === 'pending';
  const isBlocked = me?.state === 'blocked' || other?.state === 'blocked';

  // Check if current user has already sent a message (request message)
  const hasSentRequestMessage = useMemo(
    () => messages.some((msg) => msg.senderId === currentUserId),
    [messages, currentUserId]
  );

  // Sender can still type their first message if other is pending and no message sent yet
  const canSendFirstMessage = otherIsPending && !hasSentRequestMessage && !isBlocked;
  // Sender must wait after sending first message
  const isWaitingForApproval = otherIsPending && hasSentRequestMessage && !isBlocked;

  const displayName = useMemo(
    () => conversation?.name || other?.fullName || other?.username || "Unknown",
    [conversation?.name, other?.fullName, other?.username]
  );

  const avatarConfig = useMemo(
    () => (other?.avatar ? JSON.parse(other.avatar) : genConfig()),
    [other?.avatar]
  );

  const isOtherUserOnline = useMemo(
    () => (other ? onlineUsers.has(other.id) : false),
    [other, onlineUsers]
  );

  const pronoun = useMemo(() => {
    const g = other?.gender?.toLowerCase();
    if (g === 'male') return 'him';
    if (g === 'female') return 'her';
    return 'them';
  }, [other?.gender]);

  if (!conversation) {
    // This view is visible only on large screens when no conversation is selected (mobile hides the whole ChatArea div).
    return (
      <div className="flex items-center justify-center bg-[#0D1117] w-full h-full">
        <div className="text-center text-gray-500 px-4">
          <p className="text-base sm:text-lg">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  const handleDecision = async (accept: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) throw new Error('Failed to update conversation');
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch (e) {
      console.error('Decision update failed', e);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0D1117] relative w-full h-full">
      <ChatHeader
        displayName={displayName}
        avatarConfig={avatarConfig}
        isOtherUserOnline={isOtherUserOnline}
        showBackButton={showBackButton}
        onBack={onBack}
        onStartVideoCall={onStartVideoCall}
        onStartAudioCall={onStartAudioCall}
        isMessageSearchMode={isMessageSearchMode}
        messageSearchQuery={messageSearchQuery}
        setMessageSearchQuery={setMessageSearchQuery}
        handleToggleMessageSearch={handleToggleMessageSearch}
        handleClearMessageSearch={handleClearMessageSearch}
        onProfileClick={() => setShowProfile(true)}
        userId={other?.id}
      />

      <ChatMessageArea
        messages={messages}
        currentUserId={currentUserId}
        isLoadingMore={isLoadingMore}
        isLoadingMessages={isLoadingMessages}
        messageSearchQuery={messageSearchQuery}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
      />

      {/* State-specific banners */}

      {/* For RECIPIENT: Show accept/reject UI when they have pending state */}
      {isPendingForMe && (
        <div className="px-3 py-3 bg-[#161B22] border-t border-[#30363D]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
            <span className="text-sm font-medium text-[#C9D1D9]">Chat Request</span>
          </div>
          <div className="text-sm text-gray-300 mb-3">
            <span className="font-medium text-[#C9D1D9]">{other?.fullName || other?.username}</span> wants to start a conversation with you. Accept to continue chatting.
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleDecision(true)} className="bg-[#238636] hover:bg-[#238636]/90 text-white">
              Accept
            </Button>
            <Button variant="secondary" onClick={() => handleDecision(false)} className="bg-[#30363D] text-[#C9D1D9] hover:bg-[#30363D]/80 hover:text-red-400">
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* For SENDER: Show waiting message when recipient hasn't responded yet (only after first message sent) */}
      {isWaitingForApproval && (
        <div className="px-3 py-3 bg-[#161B22] border-t border-[#30363D]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
            <span className="text-sm text-gray-300">
              Waiting for <span className="font-medium text-[#C9D1D9]">{other?.fullName || other?.username}</span> to accept your request...
            </span>
          </div>
        </div>
      )}

      {/* For SENDER: Show hint to send first message */}
      {canSendFirstMessage && (
        <div className="px-3 py-3 bg-[#161B22] border-t border-[#30363D]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-sm text-gray-300">
              Send a message to request a conversation with <span className="font-medium text-[#C9D1D9]">{other?.fullName || other?.username}</span>
            </span>
          </div>
        </div>
      )}

      {/* For SENDER: Show rejection message when their request was blocked */}
      {other?.state === 'blocked' && (
        <div className="px-3 py-3 bg-[#161B22] border-t border-[#30363D]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="text-sm font-medium text-red-400">Request Rejected</span>
          </div>
          <div className="text-sm text-gray-400">
            Your request has been rejected and you cannot send messages until <span className="font-medium text-[#C9D1D9]">{other?.fullName || other?.username}</span> sends you a request.
          </div>
        </div>
      )}

      {/* For RECIPIENT: Show message when they blocked the sender */}
      {me?.state === 'blocked' && (
        <div className="px-3 py-2 bg-[#161B22] border-t border-[#30363D] text-sm text-gray-400">
          You blocked this conversation. Messages cannot be sent.
        </div>
      )}

      {/* Typing indicator */}
      {isOtherUserTyping && !isPendingForMe && !isBlocked && (
        <div className="px-4 py-1.5 bg-[#161B22] border-t border-[#30363D]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#58A6FF] animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#58A6FF] animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#58A6FF] animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
            <span className="text-xs text-gray-400">
              {other?.fullName || other?.username || 'Someone'} is typing...
            </span>
          </div>
        </div>
      )}

      <ChatInput
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        handleSend={handleSend}
        disabled={isPendingForMe || isWaitingForApproval || isBlocked}
        disabledMessage={
          isPendingForMe
            ? "Accept or reject the request above"
            : isWaitingForApproval
              ? "Waiting for response..."
              : isBlocked
                ? "Cannot send messages"
                : undefined
        }
        socket={socket}
        conversationId={conversationId}
      />

      {/* User Profile Overlay */}
      {showProfile && other && (
        <SelectedUserProfile userId={other.id} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
} 
