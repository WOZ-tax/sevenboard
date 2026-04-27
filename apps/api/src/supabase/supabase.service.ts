import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase JS client (service_role) のラッパー。
 *
 * 用途: Prisma が壊れていて書き込みが通らないテーブル（account_masters 等）の
 * 退避経路。PostgREST 経由なので Prisma の query engine を bypass する。
 *
 * 注意: service_role_key は **絶対に** フロントに漏らさない。Cloud Run の
 * env var (SUPABASE_SERVICE_ROLE_KEY) でのみ参照。
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private _client: SupabaseClient | null = null;

  onModuleInit() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      // 起動を止めず、使われたタイミングで例外を投げる（dev 環境で env 未設定でも
      // boot を妨げないため）
      return;
    }
    this._client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  get client(): SupabaseClient {
    if (!this._client) {
      throw new Error(
        'Supabase client is not initialized. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.',
      );
    }
    return this._client;
  }
}
