-- Escuela de Manejo GN
-- Imágenes opcionales para promociones
-- Ejecutar una sola vez en Supabase > SQL Editor.

alter table public.promos
add column if not exists image_url text;

alter table public.promos
add column if not exists storage_path text;
