import { supabase } from './supabase';

export type ActivityAction =
  | 'post_published'
  | 'post_failed'
  | 'template_created'
  | 'template_deleted'
  | 'template_updated'
  | 'schedule_created'
  | 'schedule_toggled'
  | 'schedule_deleted'
  | 'account_added'
  | 'account_deleted'
  | 'token_refreshed'
  | 'ai_generated'
  | 'draft_scheduled'
  | 'templates_exported'
  | 'templates_imported'
  | 'cross_publish';

export async function logActivity(
  userId: string,
  action: ActivityAction,
  opts: {
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
    accountUsername?: string;
  } = {}
) {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action,
      entity_type: opts.entityType || '',
      entity_id: opts.entityId || null,
      details: opts.details || {},
      account_username: opts.accountUsername || null,
    });
  } catch (e) {
    console.error('Failed to log activity:', e);
  }
}
