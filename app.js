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
  const keys = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'ja'));

  for (const ch of keys) {
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
    if (b.length !== a.length) return b.length - a.length;
    return a.localeCompare(b, 'ja');
  });
}

function getSourceWords(dictionary) {
  return Array.isArray(dictionary.words)
    ? dictionary.words.filter((w) => typeof w === 'string' && w.length >= 2)
    : [];
}

function getAvailableWords(dictionary, chars) {
  const counts = countChars(chars);
  const sourceWords = getSourceWords(dictionary);
  const words = sourceWords.filter((word) => canMakeWord(word, counts));
  return sortWords(uniqueWords(words));
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
  const words = getSourceWords(dictionary);
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
      if (melds === 4 && pairUsed) return path;
      return null;
    }

    if (melds > 4) return null;

    if (!pairUsed) {
      for (const ch of Object.keys(currentCounts).sort((a, b) => a.localeCompare(b, 'ja'))) {
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

function formatAgari(agariPath) {
  if (!agariPath) {
    return 'まだ上がり形ではありません';
  }

  return agariPath
    .map((x) => `${x.type === 'pair' ? '雀頭' : '面子'}: ${x.value}`)
    .join('\n');
}

function analyzeShape(chars, dictionary) {
  const words = getAvailableWords(dictionary, chars);
  const pairs = getPairCandidates(chars);

  let meld2 = 0;
  let meld3 = 0;
  let meld4p = 0;

  for (const w of words) {
    if (w.length === 2) meld2++;
    else if (w.length === 3) meld3++;
    else if (w.length >= 4) meld4p++;
  }

  const agari = canAgari(chars, dictionary);

  const score =
    (agari ? 100000 : 0) +
    meld4p * 120 +
    meld3 * 70 +
    meld2 * 20 +
    pairs.length * 45;

  return {
    words,
    pairs,
    meld2,
    meld3,
    meld4p,
    agari,
    score
  };
}

function evaluateDiscards(chars, dictionary) {
  const results = [];

  for (let i = 0; i < chars.length; i++) {
    const discard = chars[i];
    const nextChars = chars.slice(0, i).concat(chars.slice(i + 1));
    const shape = analyzeShape(nextChars, dictionary);

    results.push({
      discard,
      score: shape.score,
      meld4p: shape.meld4p,
      meld3: shape.meld3,
      meld2: shape.meld2,
      pairs: shape.pairs.length
    });
  }

  const bestByDiscard = new Map();
  for (const r of results) {
    const prev = bestByDiscard.get(r.discard);
    if (!prev || r.score > prev.score) {
      bestByDiscard.set(r.discard, r);
    }
  }

  return [...bestByDiscard.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.meld4p !== a.meld4p) return b.meld4p - a.meld4p;
    if (b.meld3 !== a.meld3) return b.meld3 - a.meld3;
    if (b.pairs !== a.pairs) return b.pairs - a.pairs;
    return a.discard.localeCompare(b.discard, 'ja');
  });
}

function makeDiscardReason(best, second) {
  if (!best) return '候補なし';

  const parts = [];
  parts.push(`4文字以上:${best.meld4p}`);
  parts.push(`3文字:${best.meld3}`);
  parts.push(`2文字:${best.meld2}`);
  parts.push(`雀頭候補:${best.pairs}`);

  if (second && best.score > second.score) {
    parts.push('次点より評価が高い');
  }

  return parts.join(' / ');
}

function getWaitSuggestions(remainingChars, dictionary, maxNeed = 2) {
  const remainCounts = countChars(remainingChars);
  const sourceWords = getSourceWords(dictionary);
  const candidates = [];

  for (const word of sourceWords) {
    const need = {};
    for (const ch of word) {
      need[ch] = (need[ch] || 0) + 1;
    }

    const missing = [];

    for (const ch of Object.keys(need)) {
      const lack = need[ch] - (remainCounts[ch] || 0);
      if (lack > 0) {
        for (let i = 0; i < lack; i++) {
          missing.push(ch);
        }
      }
    }

    let usedCount = 0;
    for (const ch of word) {
      if ((remainCounts[ch] || 0) > 0) {
        usedCount++;
      }
    }

    if (usedCount === 0) continue;
    if (missing.length === 0 || missing.length > maxNeed) continue;

    candidates.push({
      word,
      need: missing
    });
  }

  const dedup = new Map();
  for (const c of candidates) {
    const key = `${c.word}|${c.need.join('')}`;
    if (!dedup.has(key)) {
      dedup.set(key, c);
    }
  }

  return [...dedup.values()].sort((a, b) => {
    if (a.need.length !== b.need.length) return a.need.length - b.need.length;
    if (b.word.length !== a.word.length) return b.word.length - a.word.length;
    return a.word.localeCompare(b.word, 'ja');
  });
}

function getGroupingCandidates(chars, dictionary, limit = 3) {
  const counts = countChars(chars);
  const allWords = getSourceWords(dictionary).filter((w) => canMakeWord(w, counts));
  const words = sortWords(uniqueWords(allWords));
  const results = [];
  const seen = new Set();

  function scoreMelds(melds) {
    let score = 0;
    for (const w of melds) {
      if (w.length >= 4) score += 100;
      else if (w.length === 3) score += 60;
      else score += 20;
    }
    return score;
  }

  function pushResult(melds, currentCounts) {
    const remainingChars = countsToChars(currentCounts);
    const signature =
      melds.slice().sort((a, b) => a.localeCompare(b, 'ja')).join('|') +
      '__' +
      remainingChars.join('');

    if (seen.has(signature)) return;
    seen.add(signature);

    results.push({
      melds: melds.slice().sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return a.localeCompare(b, 'ja');
      }),
      remainingChars,
      score: scoreMelds(melds)
    });
  }

  function dfs(currentCounts, melds, startIndex) {
    pushResult(melds, currentCounts);

    if (results.length > 120) return;
    if (melds.length >= 4) return;

    for (let i = startIndex; i < words.length; i++) {
      const word = words[i];
      if (!canMakeWord(word, currentCounts)) continue;

      const next = removeWordFromCounts(word, currentCounts);
      if (!next) continue;

      dfs(next, [...melds, word], i);
    }
  }

  dfs(counts, [], 0);

  const ranked = results
    .filter((r) => r.melds.length > 0)
    .sort((a, b) => {
      if (b.melds.length !== a.melds.length) return b.melds.length - a.melds.length;
      if (a.remainingChars.length !== b.remainingChars.length) return a.remainingChars.length - b.remainingChars.length;
      if (b.score !== a.score) return b.score - a.score;
      return a.melds.join('').localeCompare(b.melds.join(''), 'ja');
    })
    .slice(0, limit)
    .map((r) => {
      const waits = getWaitSuggestions(r.remainingChars, dictionary, 2).slice(0, 10);
      return {
        melds: r.melds,
        remainingChars: r.remainingChars,
        waits
      };
    });

  return ranked;
}

function evaluateCalls(handChars, discards, dictionary, isOpenHand) {
  const uniqueDiscards = [...new Set(discards)];
  const decisions = [];
  const currentShape = analyzeShape(handChars, dictionary);

  for (const d of uniqueDiscards) {
    // 鳴いているならロン不可
    if (!isOpenHand) {
      const ronChars = [...handChars, d];
      const ronAgari = canAgari(ronChars, dictionary);
      if (ronAgari) {
        decisions.push({
          discard: d,
          action: 'ロン',
          word: '',
          nextDiscard: ''
        });
        continue;
      }
    }

    const testChars = [...handChars, d];
    const words = getAvailableWords(dictionary, testChars).filter((w) => w.includes(d));

    let bestAction = {
      discard: d,
      action: '何もしない',
      word: '',
      nextDiscard: '',
      score: currentShape.score
    };

    for (const word of words) {
      let actionName = '';
      if (word.length === 3) {
        actionName = 'ポン';
      } else if (word.length >= 4) {
        actionName = 'カン';
      } else {
        continue;
      }

      const counts = countChars(testChars);
      if (!canMakeWord(word, counts)) continue;

      const remainingCounts = removeWordFromCounts(word, counts);
      if (!remainingCounts) continue;

      const remainingChars = countsToChars(remainingCounts);

      // 鳴いた後は1枚切る前提で比較
      let afterScore;
      let nextDiscard = 'なし';

      if (remainingChars.length > 0) {
        const discardRanks = evaluateDiscards(remainingChars, dictionary);
        const bestDiscard = discardRanks[0];
        nextDiscard = bestDiscard ? bestDiscard.discard : 'なし';
        afterScore = bestDiscard ? bestDiscard.score : analyzeShape(remainingChars, dictionary).score;
      } else {
        afterScore = 999999;
      }

      // 鳴きは厳しめに評価
      const openPenalty = isOpenHand ? 0 : 120;
      const adjustedScore = afterScore - openPenalty;

      // 「本当におすすめ」のみにしたいので、現状より十分良いときだけ採用
      const mustImproveBy = 50;

      if (
        adjustedScore > bestAction.score &&
        adjustedScore >= currentShape.score + mustImproveBy
      ) {
        bestAction = {
          discard: d,
          action: actionName,
          word,
          nextDiscard,
          score: adjustedScore
        };
      }
    }

    decisions.push(bestAction);
  }

  return decisions.sort((a, b) => a.discard.localeCompare(b.discard, 'ja'));
}

document.getElementById('judgeBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('result');

  try {
    const hand = normalizeChars(document.getElementById('hand').value);
    const draw = normalizeChars(document.getElementById('draw').value);
    const discards = normalizeChars(document.getElementById('discards').value);
    const isOpenHand = document.getElementById('isOpenHand').checked;

    const hasDraw = draw.length > 0;
    const hasDiscards = discards.length > 0;
    const allChars = [...hand, ...draw];

    if (allChars.length === 0) {
      resultEl.textContent = '手牌か自摸牌を入力してください。';
      return;
    }

    const dictionary = await loadDictionary();
    const handShape = analyzeShape(allChars, dictionary);
    const groupingCandidates = getGroupingCandidates(allChars, dictionary, 3);

    const lines = [];
    lines.push(`手牌: ${hand.join(' ') || 'なし'}`);

    if (hasDraw) {
      lines.push(`自摸牌: ${draw.join(' ')}`);
    }

    if (hasDiscards) {
      lines.push(`相手の捨て牌: ${discards.join(' ')}`);
    }

    lines.push(`鳴き状態: ${isOpenHand ? 'あり（ツモ専）' : 'なし'}`);
    lines.push('');

    lines.push('【ツモ上がり判定】');
    if (hasDraw && handShape.agari) {
      lines.push('ツモ');
      lines.push('');
      lines.push('【上がり形】');
      lines.push(...handShape.agari.map((x) => `${x.type === 'pair' ? '雀頭' : '面子'}: ${x.value}`));
    } else {
      lines.push(formatAgari(handShape.agari));
      lines.push('');

      if (groupingCandidates.length > 0) {
        const best = groupingCandidates[0];
        const completeLines = best.melds.length ? best.melds : ['なし'];
        const incompleteLines = best.remainingChars.length
          ? [best.remainingChars.join('') + '（未完成）']
          : ['なし'];
        const waitLines = best.waits.length
          ? best.waits.map((w) => `${w.need.join('・')} → ${w.word}`)
          : ['なし'];

        lines.push('【今できている面子候補】');
        lines.push(...completeLines);
        lines.push('');
        lines.push('【未完成候補】');
        lines.push(...incompleteLines);
        lines.push('');
        lines.push('【何が来たら完成しやすいか】');
        lines.push(...waitLines);
      }

      if (hasDraw) {
        const discardRanks = evaluateDiscards(allChars, dictionary);
        const bestDiscard = discardRanks[0];
        const secondDiscard = discardRanks[1];

        lines.push('');
        lines.push('【自摸時のおすすめ打牌】');
        lines.push(bestDiscard ? `1位: ${bestDiscard.discard} を切る` : '1位: 候補なし');
        lines.push(secondDiscard ? `2位: ${secondDiscard.discard} を切る` : '2位: 候補なし');
        lines.push(`理由: ${makeDiscardReason(bestDiscard, secondDiscard)}`);
      }
    }

    if (groupingCandidates.length > 0) {
      lines.push('');
      groupingCandidates.forEach((candidate, index) => {
        const waitText = candidate.waits.length
          ? candidate.waits.map((w) => `${w.need.join('・')} → ${w.word}`).join(', ')
          : 'なし';

        lines.push(`【組み方候補${index + 1}】`);
        lines.push(`完成面子: ${candidate.melds.join(' / ') || 'なし'}`);
        lines.push(`余り: ${candidate.remainingChars.length ? candidate.remainingChars.join('') : 'なし'}`);
        lines.push(`待ち: ${waitText}`);
        if (index !== groupingCandidates.length - 1) {
          lines.push('');
        }
      });
    }

    if (hasDiscards) {
      const callDecisions = evaluateCalls(hand, discards, dictionary, isOpenHand);

      lines.push('');
      lines.push('【相手の捨て牌へのおすすめ行動】');

      if (callDecisions.length === 0) {
        lines.push('なし');
      } else {
        for (const c of callDecisions) {
          if (c.action === 'ロン') {
            lines.push(`${c.discard}: ロン`);
          } else if (c.action === 'ポン' || c.action === 'カン') {
            lines.push(`${c.discard}: ${c.action}（${c.word}）`);
          } else {
            lines.push(`${c.discard}: 何もしない`);
          }
        }
      }
    }

    resultEl.textContent = lines.join('\n');
  } catch (error) {
    resultEl.textContent = `エラー: ${error.message}`;
  }
});
