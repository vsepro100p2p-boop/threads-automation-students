/*
  # Create Storage Bucket for Template Images

  1. New Storage Bucket
    - `template-images` - stores uploaded images for carousel templates
    - Public bucket for easy access by Threads API

  2. Security
    - Authenticated users can upload images
    - Authenticated users can read/delete their own images
    - Public read access for published images (required by Threads API)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'template-images',
  'template-images',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

CREATE POLICY "Users can upload template images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'template-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their template images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'template-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their template images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'template-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public read access for template images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'template-images');