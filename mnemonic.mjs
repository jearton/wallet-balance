import { HDNodeWallet, Mnemonic, randomBytes, wordlists } from 'ethers';

export const DERIVATION_PATH = "m/44'/60'/0'/0/0";

export function generateMnemonic(wordCount = 24) {
  if (![12, 24].includes(wordCount)) throw new Error('仅支持 12 或 24 个助记词。');
  return Mnemonic.fromEntropy(randomBytes(wordCount === 12 ? 16 : 32)).phrase;
}

export function normalizeMnemonic(phrase) {
  if (typeof phrase !== 'string') throw new Error('请输入英文助记词。');
  return phrase.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

export function validateMnemonic(phrase, wordCount) {
  const normalized = normalizeMnemonic(phrase);
  const words = normalized ? normalized.split(' ') : [];
  const count = words.length;
  if (wordCount !== undefined && ![12, 24].includes(wordCount)) throw new Error('仅支持 12 或 24 个助记词。');
  if (wordCount === undefined ? ![12, 24].includes(count) : count !== wordCount) {
    throw new Error(`当前识别到 ${count} 个词，需要 ${wordCount ?? '12 或 24'} 个英文助记词。`);
  }
  const invalid = words.flatMap((word, index) => /^[a-z]+$/.test(word) && wordlists.en.getWordIndex(word) >= 0 ? [] : [index + 1]);
  if (invalid.length) throw new Error(`第 ${invalid.join('、')} 个单词不在 BIP-39 英文词库中，请检查拼写；不会自动替换单词。`);
  if (!Mnemonic.isValidMnemonic(normalized)) {
    throw new Error('词数和单词有效，但校验和不匹配。请核对单词及顺序，不会自动补词或修改校验和。');
  }
  return normalized;
}

export function parseMnemonicImport(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('请先粘贴需要导入的助记词。');
  if (input.length > 8192) throw new Error('导入内容过长，请只保留一组 12 或 24 词助记词。');
  let text = input.normalize('NFKC').toLowerCase().replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  // Retain positions as explicit markers; never sort or silently ignore numbering.
  text = text.replace(/(^|[\s,;，；、|])(?:\(\s*(\d{1,2})\s*\)|\[\s*(\d{1,2})\s*\]|(\d{1,2})(?:\s*[.)、:：\-]|\s+))\s*/g,
    (_, boundary, round, square, plain) => `${boundary} #${Number(round ?? square ?? plain)}# `);
  text = text.replace(/(^|\s)[*•·-]\s+/g, '$1');
  text = text.replace(/[.,;:，；：、|/“”"'‘’\[\]{}()<>]/g, ' ');
  const tokens = text.trim().split(/\s+/);
  const words = [];
  let markers = 0;
  let waitingForWord = false;
  for (const token of tokens) {
    if (/^#\d+#$/.test(token)) {
      const index = Number(token.slice(1, -1));
      if (waitingForWord || index !== words.length + 1) throw new Error('序号需从 1 开始连续排列，不能重复、缺失或乱序；请核对原文。');
      markers++;
      waitingForWord = true;
    } else {
      words.push(token);
      waitingForWord = false;
    }
  }
  if (waitingForWord || (markers && markers !== words.length)) throw new Error('序号与单词数量不一致，请为每个词保留连续序号，或移除全部序号。');
  return validateMnemonic(words.join(' '));
}

export function addressFromMnemonic(phrase, wordCount) {
  return walletFromMnemonic(phrase, wordCount).address;
}

export function walletFromMnemonic(phrase, wordCount) {
  const normalized = validateMnemonic(phrase, wordCount);
  try {
    const wallet = HDNodeWallet.fromPhrase(normalized, '', DERIVATION_PATH);
    return { address: wallet.address, privateKey: wallet.privateKey };
  } catch {
    throw new Error('无法从助记词推导地址，请检查输入。');
  }
}

// Prefix matching only: never guess, reorder words, or repair a checksum.
const englishWords = Array.from({ length: 2048 }, (_, index) => wordlists.en.getWord(index));
export function mnemonicSuggestions(prefix) {
  if (typeof prefix !== 'string') return [];
  const normalized = prefix.normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z]+$/.test(normalized)) return [];
  return englishWords.filter(word => word.startsWith(normalized));
}
