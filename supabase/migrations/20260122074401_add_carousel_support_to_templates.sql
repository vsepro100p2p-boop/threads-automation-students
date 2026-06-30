/*
  # Add Carousel/Image Support to Templates

  1. Changes
    - Add `media_urls` column to `thread_templates` table
    - Array of image URLs for carousel posts
    - Add `media_urls` column to `draft_posts` table
    - Add `media_urls` column to `posts` table for history

  2. Notes
    - Threads API supports up to 20 images per carousel
    - Images must be publicly accessible URLs
    - Supported formats: JPEG, PNG (max 8MB each)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thread_templates' AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE thread_templates ADD COLUMN media_urls text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'draft_posts' AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE draft_posts ADD COLUMN media_urls text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE posts ADD COLUMN media_urls text[] DEFAULT '{}';
  END IF;
END $$;

COMMENT ON COLUMN thread_templates.media_urls IS 'Array of public image URLs for carousel posts (max 20, JPEG/PNG, max 8MB each)';
COMMENT ON COLUMN draft_posts.media_urls IS 'Array of public image URLs for carousel posts';
COMMENT ON COLUMN posts.media_urls IS 'Array of image URLs that were published';