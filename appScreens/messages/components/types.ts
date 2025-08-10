export interface ChatUIReaction {
  emoji: string;
  count?: number;
  bySelf?: boolean;
  byUserIds?: string[];
}

export interface ChatUIMessage {
  id: string;
  text: string;
  time: string;
  user: string;
  isOwn?: boolean;
  status?: 'sent' | 'read';
  liked?: boolean;
  imageUrl?: string;
  reactions?: ChatUIReaction[];
}


