-- 1. Remover a constraint que obriga o ID a existir na auth.users (chave estrangeira)
-- Isso permite pré-cadastrar perfis antes do usuário fazer login
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Garantir que o ID tenha um valor padrão (UUID)
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Garantir restrição de email único para o ON CONFLICT funcionar
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_key') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
    END IF;
END $$;

-- 4. Inserir/Atualizar dados conforme planilha
DO $$
DECLARE
    all_store_ids uuid[];
    id_sjp1 uuid; id_ctba7 uuid; id_ctba11 uuid; id_ctba3 uuid; id_ctba5 uuid;
    id_cl2 uuid; id_mga3 uuid; id_mga7 uuid; id_mga5 uuid; id_mga8 uuid;
BEGIN
    SELECT array_agg(id) INTO all_store_ids FROM public.stores;
    
    SELECT id INTO id_sjp1 FROM public.stores WHERE name LIKE 'SJP 1%';
    SELECT id INTO id_ctba7 FROM public.stores WHERE name LIKE 'CTBA 7%';
    SELECT id INTO id_ctba11 FROM public.stores WHERE name LIKE 'CTBA 11%';
    SELECT id INTO id_ctba3 FROM public.stores WHERE name LIKE 'CTBA 3%';
    SELECT id INTO id_ctba5 FROM public.stores WHERE name LIKE 'CTBA 5%';
    SELECT id INTO id_cl2 FROM public.stores WHERE name LIKE 'CL 2%';
    SELECT id INTO id_mga3 FROM public.stores WHERE name LIKE 'MGA 3%';
    SELECT id INTO id_mga7 FROM public.stores WHERE name LIKE 'MGA 7%';
    SELECT id INTO id_mga5 FROM public.stores WHERE name LIKE 'MGA 5%';
    SELECT id INTO id_mga8 FROM public.stores WHERE name LIKE 'MGA 8%';

    -- DIRETORIA
    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('andre.3hat@gmail.com', 'Andre Andrade Camargo', 'diretoria', all_store_ids)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('haroldo.3hat@gmail.com', 'Haroldo Xavier da Silva', 'diretoria', all_store_ids)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('helio.3hat@gmail.com', 'Helio Xavier da Silva', 'diretoria', all_store_ids)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('helioxavierfilho@gmail.com', 'Helio Xavier da Silva Filho', 'diretoria', all_store_ids)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('thiagoccamilo90@gmail.com', 'Thiago Camilo', 'diretoria', all_store_ids)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    -- REGIONAL
    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('gerencia1.3hat@gmail.com', 'Rosecleide Barbosa dos Santos', 'regional', all_store_ids)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    -- GERENTES
    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('lider1.3hat@gmail.com', 'Aline Carola dos Santos Oliveira', 'gerente', ARRAY[id_sjp1, id_ctba7, id_ctba11])
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('lider3.3hat@gmail.com', 'Danúbia Kliciozana Braga', 'gerente', ARRAY[id_ctba3])
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('lider5.3hat@gmail.com', 'Luciane Cristina Caloi Buffa', 'gerente', ARRAY[id_ctba5])
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('lider6.3hat@gmail.com', 'Ana Carolina Lobato Figueiredo', 'gerente', ARRAY[id_cl2])
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('lider10.3hat@gmail.com', 'Mylena Neves Pimentel', 'gerente', ARRAY[id_ctba11])
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('gerencia3.3hat@gmail.com', 'Janaina Mendes', 'gerente', ARRAY[id_mga3, id_mga7])
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

    INSERT INTO public.profiles (email, name, role, store_ids)
    VALUES ('gerencia2.3hat@gmail.com', 'Natacha', 'gerente', ARRAY[id_mga5, id_mga8])
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, store_ids = EXCLUDED.store_ids;

END $$;
