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

function canMakeWord(word, counts) {
  const need = {};
  for (const ch of word) {
    need[ch] = (need[ch] || 0) + 1;
  }

  for (const ch of Object.keys(need)) {
    if ((counts[ch] || 0) < need[ch]) {
      return false;
    }
  }

  return true;
}

function removeWordFromCounts(word, baseCounts) {
  const counts = { ...baseCounts };

  for (const ch of word) {
    if (!counts[ch]) return null;
    counts[ch]--;
    if (counts[ch] < 0) return null;
    if (counts[ch] === 0) delete counts[ch];
  }

  return counts;
}

function countsToChars(counts) {
  const chars = [];

  for (const ch of Object.keys(counts)) {
    for (let i = 0; i < counts[ch]; i++) {
      chars.push(ch);
    }
  }

  return chars;
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

function getAvailableWords(dictionary, chars) {
  const counts = countChars(chars);
  const sourceWords = Array.isArray(dictionary.words) ? dictionary.words : [];

  const words = sourceWords.filter((word) => {
    return typeof word === 'string' && canMakeWord(word, counts);
  });

  return sortWords(uniqueWords(words));
}

function groupWords(words) {
  return {
    two: sortWords(words.filter((w) => w.length === 2)),
    three: sortWords(words.filter((w) => w.length === 3)),
    fourPlus: sortWords(words.filter((w) => w.length >= 4))
  };
}

function getPairCandidates(chars) {
  const counts = countChars(chars);
  const pairs = [];

  for (const ch of Object.keys(counts)) {
    if (counts[ch] >= 2) {
      pairs.push(ch + ch);
    }
  }

  return sortWords(pairs);
}

function canAgari(chars, dictionary) {
  const counts = countChars(chars);
  const words = (dictionary.words || []).filter((w) => {
    return typeof w === 'string' && w.length >= 2;
  });

  const memo = new Map();

  function keyFromState(countsObj, melds, pairUsed) {
    const parts = Object.keys(countsObj)
      .sort()
      .map((k) => `${k}:${countsObj[k]}`)
      .join('|');

    return `${parts}__${melds}__${pairUsed ? 1 : 0}`;
  }

  function dfs(currentCounts, melds, pairUsed, path) {
    const remain = countsToChars(currentCounts).length;
    const key = keyFromState(currentCounts, melds, pairUsed);

    if (memo.has(key)) return null;
    memo.set(key, true);

    if (remain === 0) {
      if (melds === 4 && pairUsed) {
        return path;
      }
      return null;
    }

    if (melds > 4) return null;

    if (!pairUsed) {
      for (const ch of Object.keys(currentCounts)) {
        if (currentCounts[ch] >= 2) {
          const next = { ...currentCounts };
          next[ch] -= 2;
          if (next[ch] === 0) delete next[ch];

          const result = dfs(
            next,
            melds,
            true,
            [...path, { type: 'pair', value: ch + ch }]
          );

          if (result) return result;
        }
      }
    }

    for (const word of words) {
      if (!canMakeWord(word, currentCounts)) continue;

      const next = removeWordFromCounts(word, currentCounts);
      if (!next) continue;

      const result = dfs(
        next,
        melds + 1,
        pairUsed,
        [...path, { type: 'meld', value: word }]
      );

      if (result) return result;
    }

    return null;
  }

  return dfs(counts, 0, false, []);
}

function evaluateDiscards(chars, dictionary) {
  const results = [];

  for (let i = 0; i < chars.length; i++) {
    const discard = chars[i];
    const nextChars = chars.slice(0, i).concat(chars.slice(i + 1));
    const words = getAvailableWords(dictionary, nextChars);
    const grouped = groupWords(words);

    const score =
      grouped.fourPlus.length * 4 +
      grouped.three.length * 3 +
      grouped.two.length * 1;

    results.push({
      discard,
      score,
      total: words.length,
      fourPlus: grouped.fourPlus.length,
      three: grouped.three.length,
      two: grouped.two.length
    });
  }

  const dedup = [];
  const seen = new Set();

  for (const r of results) {
    if (seen.has(r.discard)) continue;
    seen.add(r.discard);
    dedup.push(r);
  }

  dedup.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.fourPlus !== a.fourPlus) return b.fourPlus - a.fourPlus;
    if (b.three !== a.three) return b.three - a.three;
    if (b.two !== a.two) return b.two - a.two;
    return a.discard.localeCompare(b.discard, 'ja');
  });

  return dedup;
}

function getCallCandidates(handChars, discards, dictionary) {
  const results = [];
  const uniqueDiscards = [...new Set(discards)];

  for (const d of uniqueDiscards) {
    const testChars = [...handChars, d];
    const words = getAvailableWords(dictionary, testChars).filter((w) => w.length >= 3);

    const usable = words.filter((word) => {
      const need = {};
      for (const ch of word) {
        need[ch] = (need[ch] || 0) + 1;
      }
      return (need[d] || 0) >= 1;
    });

    if (usable.length > 0) {
      results.push({
        discard: d,
        words: usable.slice(0, 10)
      });
    }
  }

  return results.sort((a, b) => a.discard.localeCompare(b.discard, 'ja'));
}

function formatSection(title, lines) {
  if (!lines || lines.length === 0) {
    return `${title}\nなし`;
  }
  return `${title}\n${lines.join('\n')}`;
}

document.getElementById('judgeBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('result');

  try {
    const hand = normalizeChars(document.getElementById('hand').value);
    const draw = normalizeChars(document.getElementById('draw').value);
    const discards = normalizeChars(document.getElementById('discards').value);
    const isOpenHand = document.getElementById('isOpenHand').checked;

    const allChars = [...hand, ...draw];

    if (allChars.length === 0) {
      resultEl.textContent = '手牌か自摸牌を入力してください。';
      return;
    }

    const dictionary = await loadDictionary();

    const words = getAvailableWords(dictionary, allChars);
    const grouped = groupWords(words);
    const pairs = getPairCandidates(allChars);
    const agariPath = canAgari(allChars, dictionary);
    const discardRanks = evaluateDiscards(allChars, dictionary);
    const callCandidates = getCallCandidates(hand, discards, dictionary);

    const discardLines = discardRanks.slice(0, 10).map((r, index) => {
      return `${index + 1}. ${r.discard} を切る  score=${r.score} / 4文字以上:${r.fourPlus} / 3文字:${r.three} / 2文字:${r.two}`;
    });

    const callLines = callCandidates.map((c) => {
      return `${c.discard} で鳴ける候補: ${c.words.join('、')}`;
    });

    let agariLines;
    if (agariPath) {
      agariLines = agariPath.map((x) => {
        return `${x.type === 'pair' ? '雀頭' : '面子'}: ${x.value}`;
      });
    } else {
      agariLines = ['まだ上がり形ではありません'];
    }

    const lines = [
      `手牌: ${hand.join(' ') || 'なし'}`,
      `自摸牌: ${draw.join(' ') || 'なし'}`,
      `使用可能文字: ${allChars.join(' ') || 'なし'}`,
      `相手の捨て牌: ${discards.join(' ') || 'なし'}`,
      `鳴き状態: ${isOpenHand ? 'あり（ツモ専）' : 'なし'}`,
      '',
      formatSection('ツモ上がり判定', agariLines),
      '',
      formatSection('鳴き候補', callLines),
      '',
      formatSection('切る候補ランキング', discardLines),
      '',
      `作れそうな単語合計: ${words.length}件`,
      '',
      formatSection(`4文字以上（${grouped.fourPlus.length}件）`, grouped.fourPlus.slice(0, 50)),
      '',
      formatSection(`3文字（${grouped.three.length}件）`, grouped.three.slice(0, 50)),
      '',
      formatSection(`2文字（${grouped.two.length}件）`, grouped.two.slice(0, 50)),
      '',
      formatSection('雀頭候補', pairs)
    ];

    resultEl.textContent = lines.join('\n');
  } catch (error) {
    resultEl.textContent = `エラー: ${error.message}`;
  }
});
