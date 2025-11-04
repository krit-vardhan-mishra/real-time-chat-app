import { useState, useEffect, useMemo } from "react";
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

      {/* Pending/blocked banner & controls */}
      {isPendingForMe && (
        <div className="px-3 py-2 bg-[#161B22] border-t border-[#30363D]">
          <div className="text-sm text-gray-300 mb-2">
            {other?.fullName || other?.username} has messaged you for the first time. You don't know {pronoun}. Continue conversation?
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleDecision(true)} className="bg-[#238636] hover:bg-[#238636]/90">Yes, continue</Button>
            <Button variant="secondary" onClick={() => handleDecision(false)} className="bg-[#30363D] text-[#C9D1D9] hover:bg-[#30363D]/80">No, block</Button>
          </div>
        </div>
      )}

      {isBlocked && (
        <div className="px-3 py-2 bg-[#161B22] border-t border-[#30363D] text-sm text-red-400">
          Conversation is blocked. You cannot send messages.
        </div>
      )}

      <ChatInput
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        handleSend={handleSend}
        disabled={isPendingForMe || otherIsPending || isBlocked}
      />

      {/* User Profile Overlay */}
      {showProfile && other && (
        <SelectedUserProfile userId={other.id} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
} 
