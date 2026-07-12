export interface ReplyTo {
  id: string;
  sender: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: string;
  self: boolean;
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
  replyTo?: ReplyTo;
}

export interface RoomData {
  id: string;
  name: string;
  messages: ChatMessage[];
  unread: number;
  onlineUsers: string[];
  typingUsers: string[];
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
