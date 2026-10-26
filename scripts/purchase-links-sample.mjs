// Imprime links de compra da Decolar gerados pelo próprio sistema, para você
// abrir num navegador e conferir (a Decolar bloqueia consulta automática, então
// só uma pessoa consegue ver se a página abre com a rota, as datas e os
// passageiros certos). Precisa de `pnpm build`.
//
//   pnpm purchase-links                         # rotas comuns, datas daqui a 30 e 37 dias
//   pnpm purchase-links SAO RIO CWB BSB         # origem e destinos (um ou mais)
//
// Confira em cada link: rota, datas, número de adultos e se o preço mostrado
// é parecido com o que o Flight Watch mostra para a mesma rota.
import { buildDecolarSearchUrl } from '../packages/domain/dist/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

const [origin = 'SAO', ...destinations] = process.argv.slice(2).map((code) => code.toUpperCase());
const targets = destinations.length > 0 ? destinations : ['RIO', 'BSB', 'SSA', 'POA', 'REC', 'CWB'];

const departure = iso(30);
const back = iso(37);
let count = 0;
for (const destination of targets) {
  for (const [label, trip] of [
    ['só ida', { tripType: 'ONE_WAY', returnDate: null }],
    ['ida e volta', { tripType: 'ROUND_TRIP', returnDate: back }],
  ]) {
    const url = buildDecolarSearchUrl({
      originCode: origin,
      destinationCode: destination,
      departureDate: departure,
      adults: 1,
      ...trip,
    });
    count += 1;
    console.log(
      `${origin} → ${destination} (${label}, ${departure}${trip.returnDate ? ` a ${back}` : ''})`,
    );
    console.log(`  ${url ?? 'SEM LINK (dado inválido)'}\n`);
  }
}
console.log(`${count} links. Abra alguns e confira rota, datas e adultos.`);
