-- Script para sincronizar perfis órfãos com os novos IDs do Auth e deletar perfis antigos sem correspondência
DO $$
DECLARE
    u_rec RECORD;
BEGIN
    FOR u_rec IN SELECT id, email FROM auth.users WHERE email IN ('gerencia1.3hat@gmail.com', 'lider1.3hat@gmail.com')
    LOOP
        -- Atualiza o profile existente com o novo ID do auth
        UPDATE public.profiles 
        SET id = u_rec.id 
        WHERE email = u_rec.email 
        AND id != u_rec.id;
    END LOOP;
END $$;
