A proposta é migrar a lógica de sincronização (leitura e escrita) da aba consolidada "FUNCIONÁRIOS" para as abas individuais de cada loja. Isso garante que o sistema reflita os dados originais e que as atualizações feitas no sistema cheguem às fontes primárias, mantendo a integridade das fórmulas na aba consolidada.

### Etapas de Implementação

1.  **Mapeamento de Abas**: Associar cada loja do sistema à sua respectiva aba na planilha (ex: Loja CL2 -> Aba "CL 2 - Outlet Campo Largo").
2.  **Refatoração do `sync-sheets-employees`**: 
    *   Alterar a função para percorrer todas as abas de lojas identificadas.
    *   Adaptar o mapeamento de colunas (a estrutura das abas de lojas é ligeiramente diferente da aba FUNCIONÁRIOS).
    *   Manter a regra de "Somente Planilha" para Loja, Nome, Cargo e Regime, e "Bidirecional" para Folgas, Responsabilidades e Turnos.
3.  **Refatoração do `update-sheet-employee`**:
    *   Alterar a função para identificar em qual aba o funcionário está baseado na loja vinculada.
    *   Localizar e atualizar a linha correta na aba específica da loja.
4.  **Validação**: Testar a sincronização em ambas as direções para garantir que os dados fluam corretamente.

### Detalhes Técnicos

*   **Identificação de Abas**: Usaremos o prefixo do código da loja (ex: "CL 2", "CTBA 11") para localizar a aba correspondente.
*   **Estrutura de Colunas (Abas de Loja)**: 
    *   Coluna A: Nome
    *   Coluna B: Cargo
    *   Coluna C: Regime
    *   Coluna D: Folga fixa
    *   Coluna E: Estoque
    *   Coluna F: Máquina
    *   Coluna G: Turnos possíveis
    *   Coluna H: Dias de restrição (Preferencia)
    *   Coluna I: Observação
*   **Preservação de Dados**: As atualizações no Sheets via API usarão `valueInputOption=USER_ENTERED` para garantir que o formato de data e texto seja mantido conforme a interface do Google Sheets.
