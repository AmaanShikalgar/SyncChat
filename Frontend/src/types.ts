export interface ChatMessage {
  id: string;
  text: string;
  sender: string;
  self: boolean;
  timestamp: number;
}

export interface RoomData {
  id: string;
  messages: ChatMessage[];
  unread: number;
}
