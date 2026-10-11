// Prueba del traductor (consulta internet): node dev/translate-test.mjs
import { translator } from '../src/translate.js';
const cases = [['hallo', 'de', 'es'], ['Spannung', 'de', 'es'], ['die Brücke', 'de', 'es'], ['Träger', 'de', 'es'], ['Festigkeitslehre', 'de', 'es'],
  ['achieve', 'en', 'es'], ['to rely on', 'en', 'es'], ['beam', 'en', 'es'], ['tensión', 'es', 'de'], ['puente', 'es', 'de'], ['viga', 'es', 'en']];
for (const [t, a, b] of cases) {
  const r = await translator.translate(t, a, b);
  console.log(`${t} (${a}→${b}): ${r ? `${r.main}${r.notas ? ` [${r.notas}]` : ''} | ${r.alts.join(', ')} · ${r.fuente}` : '(nada)'}`);
}
