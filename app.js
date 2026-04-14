async function loadDictionary() {
  const res = await fetch('./dictionary.json');
  return await res.json();
}

function normalizeChars(text) {
  return text.replace(/\s+/g, '').split('').filter(Boolean);
}

function countChars(chars) {
  const map = {};
  for (const ch of chars) {
    map[ch] = (map[ch] || 0) + 1;
  }
  return map;
}

function canMakeWord(word, handCounts) {
  const need = {};
  for (const ch of word) {
    need[ch] = (need[ch] || 0) + 1;
  }

  for (const ch of Object.keys(need)) {
    if ((handCounts[ch] || 0) < need[ch]) {
      return false;
    }
  }
  return true;
}

function findWords(dictionary, chars) {
  const counts = countChars(chars);
  const result = [];

  for (const word of dictionary.words) {
    if (canMakeWord(word, counts)) {
      result.push(word);
    }
  }

  return result;
}

document.getElementById('judgeBtn').addEventListener('click', async () => {
  const hand = normalizeChars(document.getElementById('hand').value);
  const draw = normalizeChars(document.getElementById('draw').value);
  const discards = normalizeChars(document.getElementById('discards').value);

  const allChars = [...hand, ...draw];
  const dictionary = await loadDictionary();
  const words = findWords(dictionary, allChars);

  const resultText = [
    `手牌+自摸: ${allChars.join(' ')}`,
    `相手の捨て牌: ${discards.join(' ')}`,
    '',
    '作れそうな単語候補:',
    ...words
  ].join('\n');

  document.getElementById('result').textContent = resultText;
});
