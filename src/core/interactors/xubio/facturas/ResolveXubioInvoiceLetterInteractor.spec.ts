import {
  resolveXubioInvoiceLetterFromFiscalCondition,
  ResolveXubioInvoiceLetterInteractor,
} from './ResolveXubioInvoiceLetterInteractor';

describe('ResolveXubioInvoiceLetterInteractor', () => {
  it.each([
    ['RESPONSABLE INSCRIPTO', 'A', 'RESPONSABLE_INSCRIPTO'],
    ['IVA Responsable Inscripto', 'A', 'RESPONSABLE_INSCRIPTO'],
    ['MONOTRIBUTO', 'A', 'MONOTRIBUTISTA'],
    ['Monotributista', 'A', 'MONOTRIBUTISTA'],
    ['CONSUMIDOR FINAL', 'B', 'CONSUMIDOR_FINAL'],
    ['IVA EXENTO', 'B', 'EXENTO'],
    ['Exterior', 'B', 'EXTERIOR'],
    ['IVA no alcanzado', 'B', 'IVA_NO_ALCANZADO'],
    ['Sujeto no categorizado', 'B', 'DEFAULT_B'],
    ['', 'B', 'DEFAULT_B'],
    [null, 'B', 'DEFAULT_B'],
  ] as const)(
    'maps fiscal condition %p to invoice letter %s',
    (condicionFiscal, expectedLetter, expectedRule) => {
      const interactor = new ResolveXubioInvoiceLetterInteractor();

      const result = interactor.execute({ condicionFiscal });

      expect(result.letter).toBe(expectedLetter);
      expect(result.matchedRule).toBe(expectedRule);
    },
  );

  it('normalizes accents, underscores and extra spaces', () => {
    const result = resolveXubioInvoiceLetterFromFiscalCondition(
      '  responsable_inscripto  ',
    );

    expect(result).toEqual({
      letter: 'A',
      condicionFiscal: 'responsable_inscripto',
      matchedRule: 'RESPONSABLE_INSCRIPTO',
    });
  });
});
