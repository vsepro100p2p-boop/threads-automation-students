import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { hasAIKey, missingKeyError, AI_SETTINGS_COLUMNS } from '../_shared/ai.ts';

import { buildCors } from '../_shared/cors.ts';
import {
  getUserHour,
  calculateNextPostInWindow,
  calculateNextExactTime,
  generateSinglePost,
  generateThread,
  processTemplate,
  publishSinglePost,
  publishThread,
  publishCarousel,
} from './helpers.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    const { data: dueBatches } = await supabase
      .from('batch_publishes')
      .select(`
        *,
        threads_accounts (*)
      `)
      .in('status', ['pending', 'in_progress'])
      .lte('next_publish_at', now);

    const { data: scheduledDrafts } = await supabase
      .from('draft_posts')
      .select(`
        *,
        threads_accounts (*)
      `)
      .eq('status', 'scheduled')
      .lte('scheduled_for', now);

    const { data: dueTemplateSchedules } = await supabase
      .from('template_schedules')
      .select(`
        *,
        thread_templates!inner (
          *,
          threads_accounts (*),
          profiles (*)
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now);

    const { data: dueSchedules } = await supabase
      .from('post_schedules')
      .select(`
        *,
        threads_accounts (*),
        profiles (*)
      `)
      .eq('is_enabled', true)
      .lte('next_post_at', now);

    const results = [];

    if (dueBatches && dueBatches.length > 0) {
      for (const batch of dueBatches) {
        try {
          const tempNextPublishTime = new Date();
          tempNextPublishTime.setMinutes(tempNextPublishTime.getMinutes() + batch.interval_minutes);

          const { data: lockResult } = await supabase
            .from('batch_publishes')
            .update({
              status: 'in_progress',
              next_publish_at: tempNextPublishTime.toISOString()
            })
            .eq('id', batch.id)
            .eq('next_publish_at', batch.next_publish_at)
            .in('status', ['pending', 'in_progress'])
            .select();

          if (!lockResult || lockResult.length === 0) {
            continue;
          }

          let batchTimezone = 'UTC';
          const { data: batchProfile } = await supabase
            .from('profiles')
            .select('timezone')
            .eq('id', batch.user_id)
            .maybeSingle();
          if (batchProfile?.timezone) batchTimezone = batchProfile.timezone;

          if (batch.start_hour !== null && batch.end_hour !== null) {
            const currentHour = getUserHour(batchTimezone);
            const batchStart = batch.start_hour;
            const batchEnd = batch.end_hour;

            let outsideWindow = false;
            if (batchStart <= batchEnd) {
              outsideWindow = currentHour < batchStart || currentHour > batchEnd;
            } else {
              outsideWindow = currentHour < batchStart && currentHour > batchEnd;
            }

            if (outsideWindow) {
              const rescheduleTime = new Date();
              rescheduleTime.setMinutes(rescheduleTime.getMinutes() + 30);
              await supabase
                .from('batch_publishes')
                .update({ next_publish_at: rescheduleTime.toISOString(), status: 'pending' })
                .eq('id', batch.id);
              continue;
            }
          }

          if (!batch.threads_accounts) {
            throw new Error('Associated account not found or deleted');
          }
          if (batch.threads_accounts.is_demo || batch.threads_accounts.access_token === 'demo') continue; // демо-аккаунт: не публикуем

          const { data: template } = await supabase
            .from('thread_templates')
            .select('*')
            .eq('id', batch.template_ids[batch.current_index])
            .single();

          if (!template) {
            throw new Error('Template not found');
          }

          const content = processTemplate(template.content, batchTimezone);
          const mediaUrls = template.media_urls || [];

          let publishResult;
          if (mediaUrls.length > 0) {
            publishResult = await publishCarousel(
              batch.threads_accounts.threads_user_id,
              batch.threads_accounts.access_token,
              content[0],
              mediaUrls
            );
          } else {
            publishResult = await publishThread(
              batch.threads_accounts.threads_user_id,
              batch.threads_accounts.access_token,
              content
            );
          }

          await supabase.from('posts').insert({
            user_id: batch.user_id,
            threads_account_id: batch.account_id,
            content: content[0],
            thread_content: content,
            media_urls: mediaUrls,
            is_thread: mediaUrls.length === 0,
            status: publishResult.success ? 'published' : 'failed',
            threads_post_id: publishResult.postId || null,
            threads_post_url: publishResult.url || null,
            published_at: publishResult.success ? new Date().toISOString() : null,
            error_message: publishResult.error || null,
            generated_by_ai: false,
          });

          await supabase
            .from('thread_templates')
            .update({
              last_used_at: new Date().toISOString(),
              use_count: template.use_count + 1,
            })
            .eq('id', template.id);

          const nextIndex = batch.current_index + 1;
          const loopIndex = nextIndex >= batch.template_ids.length ? 0 : nextIndex;

          const nextPublishTime = new Date();
          nextPublishTime.setMinutes(nextPublishTime.getMinutes() + batch.interval_minutes);

          await supabase
            .from('batch_publishes')
            .update({
              current_index: loopIndex,
              next_publish_at: nextPublishTime.toISOString(),
              status: 'pending',
            })
            .eq('id', batch.id);

          results.push({
            type: 'batch',
            id: batch.id,
            success: publishResult.success,
            postId: publishResult.postId,
          });
        } catch (error) {
          await supabase
            .from('batch_publishes')
            .update({
              status: 'failed',
              error_message: error.message,
            })
            .eq('id', batch.id);

          results.push({ type: 'batch', id: batch.id, error: error.message });
        }
      }
    }

    if (scheduledDrafts && scheduledDrafts.length > 0) {
      for (const draft of scheduledDrafts) {
        try {
          const { data: draftLock } = await supabase
            .from('draft_posts')
            .update({ status: 'publishing' })
            .eq('id', draft.id)
            .eq('status', 'scheduled')
            .select();

          if (!draftLock || draftLock.length === 0) {
            continue;
          }

          if (!draft.threads_accounts) {
            throw new Error('Associated account not found or deleted');
          }
          if (draft.threads_accounts.is_demo || draft.threads_accounts.access_token === 'demo') continue; // демо-аккаунт: не публикуем

          const publishResult = draft.is_thread
            ? await publishThread(
                draft.threads_accounts.threads_user_id,
                draft.threads_accounts.access_token,
                draft.thread_content
              )
            : await publishSinglePost(
                draft.threads_accounts.threads_user_id,
                draft.threads_accounts.access_token,
                draft.content
              );

          await supabase.from('posts').insert({
            user_id: draft.user_id,
            threads_account_id: draft.threads_account_id,
            content: draft.content,
            thread_content: draft.thread_content,
            is_thread: draft.is_thread,
            status: publishResult.success ? 'published' : 'failed',
            threads_post_id: publishResult.postId || null,
            threads_post_url: publishResult.url || null,
            published_at: publishResult.success ? new Date().toISOString() : null,
            error_message: publishResult.error || null,
            generated_by_ai: draft.generated_by_ai,
          });

          await supabase
            .from('draft_posts')
            .update({ status: publishResult.success ? 'published' : 'failed' })
            .eq('id', draft.id);

          results.push({
            type: 'draft',
            id: draft.id,
            success: publishResult.success,
            postId: publishResult.postId,
          });
        } catch (error) {
          results.push({ type: 'draft', id: draft.id, error: error.message });
        }
      }
    }

    if (dueTemplateSchedules && dueTemplateSchedules.length > 0) {
      for (const scheduleItem of dueTemplateSchedules) {
        try {
          const { data: scheduleLock } = await supabase
            .from('template_schedules')
            .update({ status: 'publishing' })
            .eq('id', scheduleItem.id)
            .eq('status', 'pending')
            .select();

          if (!scheduleLock || scheduleLock.length === 0) {
            continue;
          }

          const template = scheduleItem.thread_templates;
          if (!template.threads_accounts) {
            throw new Error('Associated account not found or deleted');
          }
          if (template.threads_accounts.is_demo || template.threads_accounts.access_token === 'demo') continue; // демо-аккаунт: не публикуем
          const templateTimezone = template.profiles?.timezone || 'UTC';
          const content = processTemplate(template.content, templateTimezone);
          const mediaUrls = template.media_urls || [];

          let publishResult;
          if (mediaUrls.length > 0) {
            publishResult = await publishCarousel(
              template.threads_accounts.threads_user_id,
              template.threads_accounts.access_token,
              content[0],
              mediaUrls
            );
          } else {
            publishResult = await publishThread(
              template.threads_accounts.threads_user_id,
              template.threads_accounts.access_token,
              content
            );
          }

          await supabase.from('posts').insert({
            user_id: template.user_id,
            threads_account_id: template.threads_account_id,
            content: content[0],
            thread_content: content,
            media_urls: mediaUrls,
            is_thread: mediaUrls.length === 0,
            status: publishResult.success ? 'published' : 'failed',
            threads_post_id: publishResult.postId || null,
            threads_post_url: publishResult.url || null,
            published_at: publishResult.success ? new Date().toISOString() : null,
            error_message: publishResult.error || null,
            generated_by_ai: false,
          });

          await supabase
            .from('template_schedules')
            .update({
              status: publishResult.success ? 'published' : 'failed',
              published_at: publishResult.success ? new Date().toISOString() : null,
              error_message: publishResult.error || null,
            })
            .eq('id', scheduleItem.id);

          await supabase
            .from('thread_templates')
            .update({
              last_used_at: new Date().toISOString(),
              use_count: template.use_count + 1,
            })
            .eq('id', template.id);

          results.push({
            type: 'template_schedule',
            id: scheduleItem.id,
            success: publishResult.success,
            postId: publishResult.postId,
          });
        } catch (error) {
          await supabase
            .from('template_schedules')
            .update({
              status: 'failed',
              error_message: error.message,
            })
            .eq('id', scheduleItem.id);

          results.push({ type: 'template_schedule', id: scheduleItem.id, error: error.message });
        }
      }
    }

    if (dueSchedules && dueSchedules.length > 0) {
    for (const schedule of dueSchedules) {
      try {
        const tempNext = new Date();
        tempNext.setMinutes(tempNext.getMinutes() + schedule.frequency_minutes);

        const { data: scheduleLock } = await supabase
          .from('post_schedules')
          .update({ next_post_at: tempNext.toISOString() })
          .eq('id', schedule.id)
          .eq('next_post_at', schedule.next_post_at)
          .select();

        if (!scheduleLock || scheduleLock.length === 0) {
          continue;
        }

        const { data: aiSettings } = await supabase
          .from('ai_settings')
          .select('*')
          .eq('user_id', schedule.user_id)
          .single();

        if (!aiSettings) {
          results.push({ scheduleId: schedule.id, error: 'AI settings not found' });
          continue;
        }

        const threadCount = aiSettings.thread_count || 1;
        let content: string;
        let threadContent: string[] = [];
        let isThread = false;

        if (threadCount === 1) {
          content = await generateSinglePost(aiSettings);
          threadContent = [content];
        } else {
          threadContent = await generateThread(aiSettings, threadCount);
          content = threadContent[0];
          isThread = true;
        }

        if (!schedule.threads_accounts) {
          throw new Error('Associated account not found or deleted');
        }
        if (schedule.threads_accounts.is_demo || schedule.threads_accounts.access_token === 'demo') continue; // демо-аккаунт: не публикуем

        const publishResult = isThread
          ? await publishThread(
              schedule.threads_accounts.threads_user_id,
              schedule.threads_accounts.access_token,
              threadContent
            )
          : await publishSinglePost(
              schedule.threads_accounts.threads_user_id,
              schedule.threads_accounts.access_token,
              content
            );

        await supabase
          .from('posts')
          .insert({
            user_id: schedule.user_id,
            threads_account_id: schedule.threads_account_id,
            content,
            status: publishResult.success ? 'published' : 'failed',
            threads_post_id: publishResult.postId || null,
            threads_post_url: publishResult.url || null,
            published_at: publishResult.success ? new Date().toISOString() : null,
            error_message: publishResult.error || null,
            generated_by_ai: true,
            is_thread: isThread,
            thread_content: isThread ? threadContent : [],
          });

        const nextPostTime = new Date();
        nextPostTime.setMinutes(nextPostTime.getMinutes() + schedule.frequency_minutes);

        await supabase
          .from('post_schedules')
          .update({
            last_post_at: new Date().toISOString(),
            next_post_at: nextPostTime.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id);

        results.push({
          scheduleId: schedule.id,
          success: publishResult.success,
          postId: publishResult.postId,
        });
      } catch (error) {
        results.push({ scheduleId: schedule.id, error: error.message });
      }
    }
    }

    const { data: aiAutopostingSchedules } = await supabase
      .from('ai_autoposting_schedules')
      .select(`
        *,
        threads_accounts(*),
        profiles!ai_autoposting_schedules_user_id_fkey(timezone)
      `)
      .eq('is_enabled', true)
      .lte('next_post_at', now);

    if (aiAutopostingSchedules && aiAutopostingSchedules.length > 0) {
      for (const schedule of aiAutopostingSchedules) {
        try {
          const userTimezone = schedule.profiles?.timezone || 'UTC';
          // Режим «точное время»: публикуем в конкретные времена daily_times,
          // оконная проверка start/end не применяется.
          const isExactTimes =
            schedule.schedule_type === 'exact_times' &&
            Array.isArray(schedule.daily_times) &&
            schedule.daily_times.length > 0;

          if (!isExactTimes) {
            const currentHour = getUserHour(userTimezone);
            const startHour = schedule.start_hour ?? 0;
            const endHour = schedule.end_hour ?? 23;

            let outsideWindow = false;
            if (startHour <= endHour) {
              outsideWindow = currentHour < startHour || currentHour >= endHour;
            } else {
              outsideWindow = currentHour < startHour && currentHour >= endHour;
            }

            if (outsideWindow) {
              console.log(`Schedule ${schedule.id}: Outside time window (${startHour}-${endHour}), current hour: ${currentHour}`);
              const nextPostTime = calculateNextPostInWindow(schedule.frequency_minutes, startHour, endHour, userTimezone);
              await supabase
                .from('ai_autoposting_schedules')
                .update({ next_post_at: nextPostTime.toISOString() })
                .eq('id', schedule.id);
              continue;
            }
          }

          // Время следующего запуска: для exact_times — ближайший слот из daily_times,
          // для интервала — now + frequency_minutes.
          const tempNextPostTime = isExactTimes
            ? calculateNextExactTime(schedule.daily_times, userTimezone)
            : new Date(Date.now() + schedule.frequency_minutes * 60000);

          const { data: lockResult } = await supabase
            .from('ai_autoposting_schedules')
            .update({
              next_post_at: tempNextPostTime.toISOString()
            })
            .eq('id', schedule.id)
            .eq('next_post_at', schedule.next_post_at)
            .select();

          if (!lockResult || lockResult.length === 0) {
            continue;
          }

          if (schedule.threads_accounts?.is_demo || schedule.threads_accounts?.access_token === 'demo') continue; // демо-аккаунт: не публикуем
          if (!schedule.threads_accounts) {
            results.push({ aiScheduleId: schedule.id, error: 'Associated account not found or deleted' });
            continue;
          }

          const { data: aiSettings } = await supabase
            .from('ai_settings')
            .select(AI_SETTINGS_COLUMNS)
            .eq('user_id', schedule.user_id)
            .single();

          if (!hasAIKey(aiSettings)) {
            results.push({ aiScheduleId: schedule.id, error: missingKeyError(aiSettings) });
            continue;
          }

          const templateIds = schedule.template_ids || [];
          if (templateIds.length === 0) {
            results.push({ aiScheduleId: schedule.id, error: 'No templates configured' });
            continue;
          }

          const currentIndex = schedule.current_template_index || 0;
          const templateId = templateIds[currentIndex % templateIds.length];

          const { data: template, error: templateError } = await supabase
            .from('thread_templates')
            .select('*')
            .eq('id', templateId)
            .maybeSingle();

          if (templateError || !template) {
            results.push({ aiScheduleId: schedule.id, error: 'Template not found' });
            continue;
          }

          const templateContent = template.content as string[];
          const templateMediaUrls = template.media_urls || [];
          const postingMode = schedule.posting_mode || 'creative';
          const lastPostWasTemplate = schedule.last_post_was_template ?? false;

          let publishResult;
          let shouldUseTemplate = false;
          let generatedPosts: string[];
          let mediaUrls: string[] = [];

          if (postingMode === 'alternating') {
            shouldUseTemplate = !lastPostWasTemplate;
          }

          if (shouldUseTemplate) {
            generatedPosts = processTemplate(templateContent, userTimezone);
            mediaUrls = templateMediaUrls;

            if (mediaUrls.length > 0) {
              publishResult = await publishCarousel(
                schedule.threads_accounts.threads_user_id,
                schedule.threads_accounts.access_token,
                generatedPosts[0],
                mediaUrls
              );
            } else {
              publishResult = await publishThread(
                schedule.threads_accounts.threads_user_id,
                schedule.threads_accounts.access_token,
                generatedPosts
              );
            }
          } else {
            let generationMode: string;
            if (postingMode === 'alternating') {
              generationMode = schedule.generation_mode || 'creative';
            } else if (postingMode === 'facts') {
              generationMode = 'facts_with_intro';
            } else {
              generationMode = schedule.generation_mode || 'creative';
            }

            const generateResponse = await fetch(
              `${supabaseUrl}/functions/v1/generate-viral-threads`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  templateContent: templateContent,
                  variantCount: 1,
                  generationMode: generationMode,
                  userId: schedule.user_id,
                }),
              }
            );

            if (!generateResponse.ok) {
              const error = await generateResponse.json();
              throw new Error(error.error || 'Generation failed');
            }

            const generateResult = await generateResponse.json();
            const variants = generateResult.variants;

            if (!Array.isArray(variants) || variants.length === 0 || !Array.isArray(variants[0])) {
              throw new Error('Invalid generation response');
            }

            generatedPosts = variants[0];

            const validatedPosts = [];
            for (const post of generatedPosts) {
              if (post.length <= 500) {
                validatedPosts.push(post);
              } else {
                const sentences = post.split(/(?<=\.)\s+/);
                let currentPost = '';

                for (const sentence of sentences) {
                  if (sentence.length > 500) {
                    if (currentPost) {
                      validatedPosts.push(currentPost.trim());
                      currentPost = '';
                    }

                    const parts = sentence.split(/,\s+/);
                    for (const part of parts) {
                      if ((currentPost + part).length <= 500) {
                        currentPost += (currentPost ? ', ' : '') + part;
                      } else {
                        if (currentPost) validatedPosts.push(currentPost.trim());
                        currentPost = part.substring(0, 495) + '...';
                      }
                    }
                  } else if ((currentPost + ' ' + sentence).length <= 500) {
                    currentPost += (currentPost ? ' ' : '') + sentence;
                  } else {
                    if (currentPost) validatedPosts.push(currentPost.trim());
                    currentPost = sentence;
                  }
                }

                if (currentPost) validatedPosts.push(currentPost.trim());
              }
            }

            generatedPosts = validatedPosts;
            mediaUrls = templateMediaUrls;

            if (mediaUrls.length > 0) {
              publishResult = await publishCarousel(
                schedule.threads_accounts.threads_user_id,
                schedule.threads_accounts.access_token,
                generatedPosts[0],
                mediaUrls
              );
            } else {
              publishResult = await publishThread(
                schedule.threads_accounts.threads_user_id,
                schedule.threads_accounts.access_token,
                generatedPosts
              );
            }
          }

          await supabase.from('posts').insert({
            user_id: schedule.user_id,
            threads_account_id: schedule.threads_account_id,
            content: generatedPosts[0],
            thread_content: generatedPosts,
            media_urls: mediaUrls,
            is_thread: mediaUrls.length === 0,
            status: publishResult.success ? 'published' : 'failed',
            threads_post_id: publishResult.postId || null,
            threads_post_url: publishResult.url || null,
            published_at: publishResult.success ? new Date().toISOString() : null,
            error_message: publishResult.error || null,
            generated_by_ai: !shouldUseTemplate,
          });

          // exact_times → следующий слот из daily_times; интервал → now + frequency.
          const nextPostTime = isExactTimes
            ? calculateNextExactTime(schedule.daily_times, userTimezone)
            : new Date(Date.now() + schedule.frequency_minutes * 60000);

          let nextTemplateIndex = currentIndex;
          if (postingMode === 'alternating') {
            if (shouldUseTemplate) {
              nextTemplateIndex = (currentIndex + 1) % templateIds.length;
            }
          } else {
            nextTemplateIndex = (currentIndex + 1) % templateIds.length;
          }

          await supabase
            .from('ai_autoposting_schedules')
            .update({
              last_post_at: new Date().toISOString(),
              next_post_at: nextPostTime.toISOString(),
              total_posts_generated: schedule.total_posts_generated + 1,
              current_template_index: nextTemplateIndex,
              last_post_was_template: shouldUseTemplate,
              updated_at: new Date().toISOString(),
            })
            .eq('id', schedule.id);

          results.push({
            aiScheduleId: schedule.id,
            success: publishResult.success,
            postId: publishResult.postId,
          });
        } catch (error) {
          results.push({ aiScheduleId: schedule.id, error: error.message });
        }
      }
    }

    return new Response(
      JSON.stringify({ message: 'Schedules processed', processed: results.length, results }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
