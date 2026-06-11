A revisão da lógica de geração de escala será realizada em duas frentes: Banco de Dados (SQL) e Frontend (React). O objetivo é garantir que as folgas sejam distribuídas proporcionalmente de segunda a sexta, respeitando as regras de escala 6x1 e 5x2, além da cobertura mínima por turno definida nas configurações da loja (sincronizadas via Google Sheets).

### Alterações Propostas

#### 1. Banco de Dados (PostgreSQL)
*   **Atualização da Função `generate_base_schedule`**:
    *   Refatorar a lógica de escolha do dia de folga na semana. Atualmente, a função usa um fallback simples (Quarta/Quinta/Sexta) que causa o acúmulo de folgas no mesmo dia.
    *   Implementar um sistema de "rodízio" ou distribuição baseada no índice do funcionário na equipe (`v_emp_index % 5`) para espalhar as folgas de Segunda a Sexta.
    *   Garantir que na escala 5x2, o funcionário tenha exatamente 2 folgas na semana, sendo que se uma for no Domingo (conforme `monthly_sunday_off`), ele terá apenas mais uma entre Segunda e Sexta.
    *   Garantir que na escala 6x1, se o funcionário folgar no Domingo, ele NÃO tenha outra folga na mesma semana.
    *   Ajustar a verificação de cobertura mínima (`min_opening_staff`, `min_closing_staff`, `min_weekday_staff`) para gerar alertas ou criar slots de freelancer automaticamente se o mínimo não for atingido após a distribuição das folgas.

#### 2. Frontend (React)
*   **Componente `ResumoSemanal.tsx`**:
    *   Ajustar a exibição da contagem de abertura (`Ab`) e fechamento (`Fc`) para considerar tanto funcionários quanto freelancers.
    *   Adicionar alertas visuais quando a cobertura mínima diária (`min_weekday_staff`, `min_weekend_staff`, `min_sunday_staff`) não for atingida.
*   **Componente `GerarEscalaMensalModal.tsx`**:
    *   Melhorar a interface de atribuição de domingos para facilitar a visualização do equilíbrio da equipe.

#### 3. Sincronização e Configuração
*   **Validação de Regras**: Garantir que as regras sincronizadas do Google Sheets (através da Edge Function `sync-sheets-stores`) sejam a base absoluta para as travas de segurança na geração.

### Detalhes Técnicos
*   **SQL**: Modificar `generate_base_schedule` para calcular dinamicamente o dia de folga: `v_off_day := (v_emp_index % 5) + 1` (onde 1=Segunda, 5=Sexta).
*   **RLS**: Verificar se as políticas de segurança permitem a inserção correta dos novos registros de rastreamento de folgas.
*   **Performance**: A função continuará operando via RPC para garantir rapidez na geração do mês completo.
