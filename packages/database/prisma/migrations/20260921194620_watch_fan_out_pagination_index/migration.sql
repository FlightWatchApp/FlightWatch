-- EVAL-PERF-002 (packages/database/src/__benchmarks__/fan-out-benchmark.ts):
-- o índice de 2 colunas não cobria o `id` usado pela paginação por cursor de
-- selectActiveWatchesPage, degradando a 29s para 100.000 Watches num único
-- SearchTarget. Estende pra 3 colunas (prefixo compatível, nenhuma consulta
-- que usava o índice antigo perde cobertura).
--
-- Sem dados reais em produção ainda (mesma ressalva de outras migrações desta
-- fase) — um DROP/CREATE INDEX simples é seguro aqui. Numa tabela grande em
-- produção, isso precisaria ser `CREATE INDEX CONCURRENTLY` (fora de uma
-- transação) para não travar escritas durante a construção do índice.

-- DropIndex
DROP INDEX "watches_searchTargetId_status_idx";

-- CreateIndex
CREATE INDEX "watches_searchTargetId_status_id_idx" ON "watches"("searchTargetId", "status", "id");
