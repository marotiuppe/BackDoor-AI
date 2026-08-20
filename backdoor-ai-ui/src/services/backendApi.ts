import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ChatResponseDto, ConversationDto, ProviderMetadata } from '../types/chat';

export class BackendApiError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message);
    this.name = 'BackendApiError';
  }
}

export class BackendApi {
  constructor() {}

  async getProviders(): Promise<ProviderMetadata[]> {
    try {
      return await invoke<ProviderMetadata[]>('get_providers');
    } catch (e) {
      throw new BackendApiError(e as string);
    }
  }

  async getConversations(): Promise<ConversationDto[]> {
    try {
      return await invoke<ConversationDto[]>('get_conversations');
    } catch (e) {
      throw new BackendApiError(e as string);
    }
  }

  async getConversation(id: string): Promise<ConversationDto> {
    try {
      return await invoke<ConversationDto>('get_conversation', { id });
    } catch (e) {
      throw new BackendApiError(e as string);
    }
  }

  async createConversation(input: { title: string; provider: string; model: string }): Promise<ConversationDto> {
    try {
      return await invoke<ConversationDto>('create_conversation', { input });
    } catch (e) {
      throw new BackendApiError(e as string);
    }
  }

  async sendMessage(id: string, content: string, model: string): Promise<ChatResponseDto> {
    return new Promise(async (resolve, reject) => {
      let unlistenChunk: (() => void) | undefined;
      let unlistenDone: (() => void) | undefined;
      let resolved = false;

      const cleanup = () => {
        if (unlistenChunk) unlistenChunk();
        if (unlistenDone) unlistenDone();
      };

      try {
        unlistenChunk = await listen<string>('ai-stream-chunk', () => {
          // Chunks
        });

        unlistenDone = await listen<ChatResponseDto>('ai-stream-done', (event) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(event.payload);
          }
        });

        const directResult = await invoke<ChatResponseDto>('send_message', { id, content, model });
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(directResult);
        }
      } catch (e) {
        cleanup();
        reject(new BackendApiError(e as string));
      }
    });
  }
}
