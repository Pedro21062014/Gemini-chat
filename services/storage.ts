import { ChatSession, User } from '../types';

const STORAGE_KEYS = {
  USER: 'gemini_workspace_user',
  CHATS: 'gemini_workspace_chats',
  CURRENT_CHAT: 'gemini_workspace_current_chat_id'
};

export const saveUser = (user: User) => {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};

export const getUser = (): User | null => {
  const data = localStorage.getItem(STORAGE_KEYS.USER);
  return data ? JSON.parse(data) : null;
};

export const removeUser = () => {
  localStorage.removeItem(STORAGE_KEYS.USER);
};

export const saveChats = (chats: ChatSession[]) => {
  localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
};

export const getChats = (): ChatSession[] => {
  const data = localStorage.getItem(STORAGE_KEYS.CHATS);
  return data ? JSON.parse(data) : [];
};

export const saveCurrentChatId = (id: string) => {
  localStorage.setItem(STORAGE_KEYS.CURRENT_CHAT, id);
};

export const getCurrentChatId = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_CHAT);
};
