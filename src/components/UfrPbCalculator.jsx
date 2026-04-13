import { useState, useEffect } from 'react';
import { NumericFormat } from 'react-number-format';
import { fetchCurrentUfrPbValue } from '../services/ufrPbService';

const UfrPbCalculator = () => {
  const [ufrPbValue, setUfrPbValue] = useState(70); // Default value for UFR-PB
  const [premio, setPremio] = useState('');
  const [incentivo, setIncentivo] = useState('');
  const [percentual, setPercentual] = useState(7.5);
  const [baseCalculo, setBaseCalculo] = useState(0);
  const [valorFomento, setValorFomento] = useState(0);
  const [valorMinimo, setValorMinimo] = useState(0);
  const [valorFinal, setValorFinal] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchUfrPb = async () => {
      try {
        const ufrPbData = await fetchCurrentUfrPbValue();
        if (isMounted) {
          setUfrPbValue(ufrPbData.value);
        }
      } catch (error) {
        if (isMounted && error.name !== 'AbortError') {
          console.error('Erro ao buscar valor da UFR-PB:', error);
        }
      }
    };

    fetchUfrPb();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const premioValue = parseFloat(premio) || 0;
    const incentivoValue = parseFloat(incentivo) || 0;

    // Base calculation: Prêmio + (Incentivo - 15% of Prêmio if applicable)
    let baseCalculoValue = 0;
    if (premioValue > 0 || incentivoValue > 0) {
      baseCalculoValue = premioValue + Math.max(0, incentivoValue - premioValue * 0.15);
    }
    setBaseCalculo(baseCalculoValue);

    // Calculate fomento value (7.5% of base calculation)
    const valorFomentoValue = baseCalculoValue * (percentual / 100);
    setValorFomento(valorFomentoValue);
    
    // Calculate minimum value (60 UFR-PB)
    const valorMinimoValue = ufrPbValue * 60;
    setValorMinimo(valorMinimoValue);
    
    // Final value is the greater of fomento value or minimum value
    const valorFinalValue = Math.max(valorFomentoValue, valorMinimoValue);
    setValorFinal(valorFinalValue);
  }, [premio, incentivo, percentual, ufrPbValue]);

  const handleMoneyInputFocus = (event) => {
    event.target.select();
  };

  const formatCurrency = (value) => {
    if (value === undefined || value === null || isNaN(value)) {
      return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Calculadora de Fomento Social</h1>
        <p className="text-zinc-600">
          Cálculo de destinação de recursos conforme Art. 29 da legislação vigente
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Inputs Section */}
        <div className="space-y-6">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
            <h2 className="text-xl font-semibold text-zinc-900 mb-4">Dados do Jogo</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Valor do Prêmio (R$)
                </label>
                <NumericFormat
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"
                  thousandSeparator="."
                  decimalSeparator=","
                  prefix="R$ "
                  decimalScale={2}
                  fixedDecimalScale
                  allowNegative={false}
                  inputMode="decimal"
                  onFocus={handleMoneyInputFocus}
                  value={premio}
                  onValueChange={(values) => setPremio(values.floatValue || 0)}
                  placeholder="R$ 0,00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Valor do Incentivo (R$)
                </label>
                <NumericFormat
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"
                  thousandSeparator="."
                  decimalSeparator=","
                  prefix="R$ "
                  decimalScale={2}
                  fixedDecimalScale
                  allowNegative={false}
                  inputMode="decimal"
                  onFocus={handleMoneyInputFocus}
                  value={incentivo}
                  onValueChange={(values) => setIncentivo(values.floatValue || 0)}
                  placeholder="R$ 0,00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Percentual (%)
                </label>
                <NumericFormat
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"
                  thousandSeparator=""
                  decimalSeparator=","
                  suffix="%"
                  decimalScale={2}
                  fixedDecimalScale
                  allowNegative={false}
                  inputMode="decimal"
                  value={percentual}
                  onValueChange={(values) => setPercentual(values.floatValue || 7.5)}
                  placeholder="7,5%"
                />
              </div>

              <div className="pt-4 border-t border-slate-200">
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Valor da unidade UFR-PB
                </label>
                <div className="relative">
                  <NumericFormat
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-slate-100"
                    thousandSeparator="."
                    decimalSeparator=","
                    prefix="R$ "
                    decimalScale={2}
                    fixedDecimalScale
                    allowNegative={false}
                    inputMode="decimal"
                    value={ufrPbValue}
                    disabled
                    placeholder="R$ 0,00"
                  />
                  <a
                    href="https://www.sefaz.pb.gov.br/info/indices-e-tabelas/ufr-pb"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-3 top-3 text-xs text-cyan-600 hover:text-cyan-800 underline"
                  >
                    Consultar valor atual
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          <div className="bg-cyan-50 p-6 rounded-xl border border-cyan-200">
            <h2 className="text-xl font-semibold text-cyan-900 mb-4">Resultado do Cálculo</h2>
            
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-cyan-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-cyan-700">Base de Cálculo</span>
                  <span className="font-semibold text-cyan-900">
                    {formatCurrency(baseCalculo)}
                  </span>
                </div>
                <p className="text-xs text-cyan-600 mt-1">
                  Prêmio + Incentivo (com dedução de 15% do prêmio sobre o incentivo)
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border border-cyan-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-cyan-700">Fomento Calculado ({percentual}%)</span>
                  <span className="font-semibold text-cyan-900">
                    {formatCurrency(valorFomento)}
                  </span>
                </div>
                <p className="text-xs text-cyan-600 mt-1">
                  {percentual}% da base de cálculo
                </p>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-amber-800">Valor Mínimo (60 UFR-PB)</span>
                  <span className="font-semibold text-amber-900">
                    {formatCurrency(valorMinimo)}
                  </span>
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  Conforme § 1º e § 2º do Art. 29 - valor mínimo garantido
                </p>
              </div>

              <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200 border-2">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-emerald-900">Valor Final de Fomento</span>
                  <span className="text-xl font-bold text-emerald-900">
                    {formatCurrency(valorFinal)}
                  </span>
                </div>
                <p className="text-xs text-emerald-700 mt-2">
                  Maior valor entre fomento calculado e valor mínimo
                </p>
              </div>
            </div>
          </div>

          {/* Legislation Info */}
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
            <h3 className="text-lg font-semibold text-zinc-900 mb-3">Legislação Aplicável</h3>
            <div className="text-sm text-zinc-700 space-y-2">
              <p><strong>Art. 29</strong> Da totalidade dos prêmios em bens e/ou em dinheiro, previstos no plano de jogo, serão devidos os seguintes percentuais:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>I – 7,5% (sete e meio por cento) em favor da LOTEP;</li>
                <li>II – 7,5% (sete e meio por cento) vertidos para o fomento à promoção de políticas de bem-estar social e de programas nas áreas de assistência, desportos, educação, saúde e desenvolvimento social a serem executadas pela autorizada em parceria com a LOTEP.</li>
              </ul>
              <p className="pt-2"><strong>§ 1º</strong> Os valores estabelecidos nos incisos I e II não poderão ser inferiores a quantia de 60 (sessenta) UFR-PB.</p>
              <p className="pt-2"><strong>§ 2º</strong> Nas hipóteses em que, realizada a aplicação dos percentuais previstos nos incisos I e II, o resultado for inferior ao estabelecido no parágrafo anterior será cobrado o valor-base de 60 (sessenta) UFR-PB.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UfrPbCalculator;