export interface ChatMessage {
  id: string;
  text: string;
  sender: string;
  self: boolean;
  timestamp: number;
  editedAt?: number;
  deleted?: boolean;
}

export interface RoomData {
  id: string;
  messages: ChatMessage[];
  unread: number;
  onlineUsers: string[];
  typingUsers: string[];
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
