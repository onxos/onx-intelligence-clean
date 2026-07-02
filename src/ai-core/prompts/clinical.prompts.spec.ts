import {
  CLINICAL_SYSTEM_PROMPT,
  diagnosisPrompt,
  evidenceQualityPrompt,
  protocolPrompt,
} from './clinical.prompts';

describe('clinical prompts (HC-02 differential support)', () => {
  it('system prompt forbids a final diagnosis (HC-02)', () => {
    expect(CLINICAL_SYSTEM_PROMPT).toContain('HC-02');
    expect(CLINICAL_SYSTEM_PROMPT.toLowerCase()).toContain('must not');
    expect(CLINICAL_SYSTEM_PROMPT.toLowerCase()).toContain('differential');
  });

  it('diagnosisPrompt lists the provided symptoms', () => {
    const prompt = diagnosisPrompt(['lethargy', 'anorexia'], '8yo cat');
    expect(prompt).toContain('- lethargy');
    expect(prompt).toContain('- anorexia');
    expect(prompt).toContain('8yo cat');
  });

  it('diagnosisPrompt frames output as differential, not final', () => {
    const prompt = diagnosisPrompt(['cough']);
    expect(prompt).toContain('DIFFERENTIAL');
    expect(prompt).toContain('HC-02');
    expect(prompt.toLowerCase()).toContain('not a final');
  });

  it('diagnosisPrompt handles missing history', () => {
    const prompt = diagnosisPrompt(['vomiting']);
    expect(prompt).toContain('not provided');
  });

  it('diagnosisPrompt handles no symptoms', () => {
    const prompt = diagnosisPrompt([]);
    expect(prompt).toContain('(none provided)');
  });

  it('diagnosisPrompt requests clinician confirmation', () => {
    const prompt = diagnosisPrompt(['fever']);
    expect(prompt.toLowerCase()).toContain('licensed clinician');
  });

  it('protocolPrompt embeds the condition and context', () => {
    const prompt = protocolPrompt('parvovirus', 'rural clinic');
    expect(prompt).toContain('parvovirus');
    expect(prompt).toContain('rural clinic');
    expect(prompt.toLowerCase()).toContain('evidence-based');
  });

  it('protocolPrompt notes clinician final authority', () => {
    const prompt = protocolPrompt('otitis');
    expect(prompt.toLowerCase()).toContain('final authority');
    expect(prompt).toContain('not provided');
  });

  it('evidenceQualityPrompt references the AC-05 hierarchy and sources', () => {
    const prompt = evidenceQualityPrompt('claim x', ['source a', 'source b']);
    expect(prompt).toContain('AC-05');
    expect(prompt).toContain('claim x');
    expect(prompt).toContain('1. source a');
    expect(prompt).toContain('2. source b');
  });

  it('evidenceQualityPrompt handles no sources', () => {
    const prompt = evidenceQualityPrompt('claim y', []);
    expect(prompt).toContain('(none provided)');
  });
});
