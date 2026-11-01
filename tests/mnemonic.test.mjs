import test from 'node:test';
import assert from 'node:assert/strict';
import { Mnemonic, HDNodeWallet } from 'ethers';
import { generateMnemonic, validateMnemonic, parseMnemonicImport, addressFromMnemonic, DERIVATION_PATH } from '../src/shared/mnemonic.mjs';

test('generates independent 24-word mnemonics with 256-bit entropy and valid checksum', () => {
  const phrases = new Set();
  for (let i = 0; i < 4; i++) {
    const phrase = generateMnemonic();
    assert.equal(phrase.split(' ').length, 24);
    assert.equal(validateMnemonic(phrase), phrase);
    assert.equal(Mnemonic.fromPhrase(phrase).entropy.length, 66);
    phrases.add(phrase);
  }
  assert.equal(phrases.size, 4);
});

test('generates valid 12-word mnemonics with 128-bit entropy', () => {
  const phrases = new Set();
  for (let i = 0; i < 4; i++) {
    const phrase = generateMnemonic(12);
    assert.equal(phrase.split(' ').length, 12);
    assert.equal(validateMnemonic(phrase, 12), phrase);
    assert.equal(Mnemonic.fromPhrase(phrase).entropy.length, 34);
    phrases.add(phrase);
  }
  assert.equal(phrases.size, 4);
  assert.throws(() => generateMnemonic(18), /仅支持/);
});

test('12-word standard vector derives expected EVM address and cannot pass as 24 words', () => {
  const phrase = `${'abandon '.repeat(11)}about`;
  assert.equal(addressFromMnemonic(phrase, 12), '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  assert.throws(() => validateMnemonic(phrase, 24), /24/);
  assert.throws(() => validateMnemonic(`${'abandon '.repeat(23)}art`, 12), /12/);
});

test('edits require valid word count, wordlist and checksum without exposing phrase in errors', () => {
  const invalid = ['abandon '.repeat(24).trim(), 'unknownword '.repeat(24).trim(), 'abandon '.repeat(12).trim()];
  for (const phrase of invalid) assert.throws(() => validateMnemonic(phrase), error => !error.message.includes(phrase));
});

test('derives first EVM account from standard 24-word zero-entropy vector', () => {
  // Public BIP-39 test data, never a real wallet.
  const phrase = `${'abandon '.repeat(23)}art`;
  assert.equal(Mnemonic.fromPhrase(phrase).entropy, '0x' + '00'.repeat(32));
  const actual = addressFromMnemonic('  ' + phrase.toUpperCase().replaceAll(' ', '\n') + '  ');
  assert.equal(actual, HDNodeWallet.fromSeed(Mnemonic.fromPhrase(phrase).computeSeed()).derivePath(DERIVATION_PATH).address);
  assert.match(actual, /^0x[0-9a-fA-F]{40}$/);
});

const importVector = [...Array(11).fill('abandon'), 'about'];
const expectedImport = importVector.join(' ');

test('imports common punctuation, line breaks, uppercase, quoted arrays and invisible characters without changing wallet', () => {
  const variants = [
    importVector.join('\n\t  ').toUpperCase(),
    importVector.join('，；、'),
    JSON.stringify(importVector),
    `“${importVector.join('” “')}”.`,
    importVector.map(word => word.slice(0, 2) + '\u200b' + word.slice(2)).join('\u00a0'),
    importVector.map(word => [...word].map(char => String.fromCharCode(char.charCodeAt(0) + 0xfee0)).join('')).join('　'),
    importVector.map(word => `- ${word}`).join('\n'),
  ];
  for (const variant of variants) {
    assert.equal(parseMnemonicImport(variant), expectedImport);
    assert.equal(addressFromMnemonic(parseMnemonicImport(variant)), '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  }
});

test('imports continuous numbering with several common list formats and detects 24 words', () => {
  for (const format of [(i, word) => `${i}. ${word}`, (i, word) => `${i})${word}`, (i, word) => `(${i}) ${word}`, (i, word) => `[${i}] ${word}`, (i, word) => `${i}、${word}`, (i, word) => `${String(i).padStart(2, '0')} ${word}`]) {
    assert.equal(parseMnemonicImport(importVector.map((word, i) => format(i + 1, word)).join('\n')), expectedImport);
  }
  const phrase24 = [...Array(23).fill('abandon'), 'art'];
  assert.equal(parseMnemonicImport(phrase24.map((word, i) => `${i + 1}: ${word}`).join(', ')), phrase24.join(' '));
});

test('numbered import rejects missing, duplicate, mixed and reordered indexes without silently sorting words', () => {
  for (const indexAt of [i => i === 3 ? 3 : i + 1, i => i === 3 ? 5 : i + 1, i => i === 0 ? 0 : i + 1]) {
    assert.throws(() => parseMnemonicImport(importVector.map((word, i) => `${indexAt(i)}. ${word}`).join('\n')), /序号/);
  }
  assert.throws(() => parseMnemonicImport('1. abandon ' + importVector.slice(1).join(' ')), /序号/);
  assert.throws(() => parseMnemonicImport(expectedImport + ' 13.'), /序号/);
});

test('import gives count, spelling position and checksum errors while retaining strict validation', () => {
  assert.throws(() => parseMnemonicImport(''), /先粘贴/);
  assert.throws(() => parseMnemonicImport(importVector.slice(0, 11).join(',')), /11 个词/);
  const typo = [...importVector]; typo[3] = 'abandno';
  assert.throws(() => parseMnemonicImport(typo.join(' ')), error => /第 4 个单词/.test(error.message) && !error.message.includes('abandno'));
  assert.throws(() => parseMnemonicImport(Array(12).fill('abandon').join(' ')), /校验和/);
  assert.throws(() => parseMnemonicImport('x'.repeat(8193)), /过长/);
});

test('BIP-39 autocomplete matches prefixes only and uniquely resolves four-letter prefixes', async () => {
  const { mnemonicSuggestions } = await import('../src/shared/mnemonic.mjs');
  const { wordlists } = await import('ethers');
  assert.deepEqual(mnemonicSuggestions('aban'), ['abandon']);
  assert.deepEqual(mnemonicSuggestions('  ＡＢＡＮ  '), ['abandon']);
  assert.ok(mnemonicSuggestions('ab').length > 1);
  assert.deepEqual(mnemonicSuggestions('zzzz'), []);
  assert.deepEqual(mnemonicSuggestions('abandon about'), []);
  assert.deepEqual(mnemonicSuggestions(''), []);
  assert.deepEqual(mnemonicSuggestions('ab1'), []);
  for (let index = 0; index < 2048; index++) {
    const word = wordlists.en.getWord(index);
    if (word.length >= 4) assert.deepEqual(mnemonicSuggestions(word.slice(0, 4)), [word]);
    else assert.ok(mnemonicSuggestions(word).includes(word));
  }
});
