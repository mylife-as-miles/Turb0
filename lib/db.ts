import Dexie, { Table } from 'dexie';

export interface Chat {
  id: string;
  model: string;
  quality: string;
  prompt: string;
  title: string;
  llamaCoderVersion: string;
  shadcn: boolean;
  createdAt: Date;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  files: any; // Using any for Json type compatibility
  chatId: string;
  position: number;
  createdAt: Date;
}

export interface ChatWithMessages extends Chat {
    messages: Message[];
    assistantMessagesCountBefore?: number;
    totalMessages?: number;
}

export class TurboDB extends Dexie {
  chats!: Table<Chat>;
  messages!: Table<Message>;

  constructor() {
    super('turb0-db');
    this.version(1).stores({
      chats: 'id, createdAt', // Primary key and indexed props
      messages: 'id, chatId, [chatId+createdAt]'
    });
  }
}

export const db = new TurboDB();
