async function loadDictionary() {
  const res = await fetch('./dictionary.json');
  if (!res.ok) {
    throw new Error('dictionary.json の読み込みに失敗しました');
  }
  return await res.json();
}

function normalizeChars(text) {
  return text
    .replace(/\s+/g, '')
    .replace(/[^\u3041-\u3096ー]/g, '')
    .split('')
    .filter(Boolean);
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

function uniqueWords(words) {
  return [...new Set(words)];
}

function sortWords(words) {
  return [...words].sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    return a.localeCompare(b, 'ja');
  });
}

function groupWords(words) {
  const grouped = {
    two: [],
    three: [],
    fourPlus: []
  };

  for (const word of words) {
    if (word.length === 2) {
      grouped.two.push(word);
    } else if (word.length === 3) {
      grouped.three.push(word);
    } else if (word.length >= 4) {
      grouped.fourPlus.push(word);
    }
  }

  grouped.two = sortWords(uniqueWords(grouped.two));
  grouped.three = sortWords(uniqueWords(grouped.three));
  grouped.fourPlus = sortWords(uniqueWords(grouped.fourPlus));

  return grouped;
}

function findWords(dictionary, chars) {
  const counts = countChars(chars);
  const sourceWords = Array.isArray(dictionary.words) ? dictionary.words : [];
  const result = [];

  for (const word of sourceWords) {
    if (typeof word !== 'string') continue;
    if (canMakeWord(word, counts)) {
      result.push(word);
    }
  }

  return uniqueWords(result);
}

function formatSection(title, words) {
  if (words.length === 0) {
    return `${title}（0件）\nなし`;
  }
  return `${title}（${words.length}件）\n${words.join('\n')}`;
}

document.getElementById('judgeBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('result');

  try {
    const hand = normalizeChars(document.getElementById('hand').value);
    const draw = normalizeChars(document.getElementById('draw').value);
    const discards = normalizeChars(document.getElementById('discards').value);

    const allChars = [...hand, ...draw];

    if (hand.length === 0 && draw.length === 0) {
      resultEl.textContent = '手牌か自摸牌を入力してください。';
      return;
    }

    const dictionary = await loadDictionary();
    const words = findWords(dictionary, allChars);
    const grouped = groupWords(words);

    const lines = [
      `手牌: ${hand.join(' ') || 'なし'}`,
      `自摸牌: ${draw.join(' ') || 'なし'}`,
      `使用可能文字: ${allChars.join(' ') || 'なし'}`,
      `相手の捨て牌: ${discards.join(' ') || 'なし'}`,
      '',
      `作れそうな単語合計: ${words.length}件`,
      '',
      formatSection('4文字以上', grouped.fourPlus),
      '',
      formatSection('3文字', grouped.three),
      '',
      formatSection('2文字', grouped.two)
    ];

    resultEl.textContent = lines.join('\n');
  } catch (error) {
    resultEl.textContent = `エラー: ${error.message}`;
  }
});
