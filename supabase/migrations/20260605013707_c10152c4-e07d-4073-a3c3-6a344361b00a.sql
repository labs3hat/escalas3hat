ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_auth BOOLEAN DEFAULT false;

-- Update existing profiles that we know have auth accounts
UPDATE public.profiles SET has_auth = true WHERE email IN ('andre.3hat@gmail.com', 'lider1.3hat@gmail.com', 'gerencia1.3hat@gmail.com');

-- Ensure service_role can update this
GRANT ALL ON public.profiles TO service_role;
