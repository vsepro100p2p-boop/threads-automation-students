export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      threads_accounts: {
        Row: {
          id: string
          user_id: string
          threads_user_id: string
          username: string
          access_token: string
          token_expires_at: string | null
          is_active: boolean
          is_demo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          threads_user_id: string
          username: string
          access_token: string
          token_expires_at?: string | null
          is_active?: boolean
          is_demo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          threads_user_id?: string
          username?: string
          access_token?: string
          token_expires_at?: string | null
          is_active?: boolean
          is_demo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      ai_settings: {
        Row: {
          id: string
          user_id: string
          ai_provider: string
          model_name: string
          temperature: number
          tone: string
          topics: Json
          language: string
          custom_instructions: string
          reference_text: string
          thread_count: number
          gemini_api_key: string | null
          openai_api_key: string | null
          claude_api_key: string | null
          deepseek_api_key: string | null
          deepseek_model: string | null
          grok_api_key: string | null
          grok_model: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ai_provider?: string
          model_name?: string
          temperature?: number
          tone?: string
          topics?: Json
          language?: string
          custom_instructions?: string
          reference_text?: string
          thread_count?: number
          gemini_api_key?: string | null
          openai_api_key?: string | null
          claude_api_key?: string | null
          deepseek_api_key?: string | null
          deepseek_model?: string | null
          grok_api_key?: string | null
          grok_model?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ai_provider?: string
          model_name?: string
          temperature?: number
          tone?: string
          topics?: Json
          language?: string
          custom_instructions?: string
          reference_text?: string
          thread_count?: number
          gemini_api_key?: string | null
          openai_api_key?: string | null
          claude_api_key?: string | null
          deepseek_api_key?: string | null
          deepseek_model?: string | null
          grok_api_key?: string | null
          grok_model?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      post_schedules: {
        Row: {
          id: string
          user_id: string
          threads_account_id: string
          is_enabled: boolean
          frequency_minutes: number
          next_post_at: string
          last_post_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          threads_account_id: string
          is_enabled?: boolean
          frequency_minutes?: number
          next_post_at?: string
          last_post_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          threads_account_id?: string
          is_enabled?: boolean
          frequency_minutes?: number
          next_post_at?: string
          last_post_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      posts: {
        Row: {
          id: string
          user_id: string
          threads_account_id: string
          content: string
          status: string
          threads_post_id: string | null
          threads_post_url: string | null
          generated_by_ai: boolean
          scheduled_for: string | null
          published_at: string | null
          error_message: string | null
          thread_content: Json
          is_thread: boolean
          thread_position: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          threads_account_id: string
          content: string
          status?: string
          threads_post_id?: string | null
          threads_post_url?: string | null
          generated_by_ai?: boolean
          scheduled_for?: string | null
          published_at?: string | null
          error_message?: string | null
          thread_content?: Json
          is_thread?: boolean
          thread_position?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          threads_account_id?: string
          content?: string
          status?: string
          threads_post_id?: string | null
          threads_post_url?: string | null
          generated_by_ai?: boolean
          scheduled_for?: string | null
          published_at?: string | null
          error_message?: string | null
          thread_content?: Json
          is_thread?: boolean
          thread_position?: number
          created_at?: string
        }
      }
    }
  }
}
