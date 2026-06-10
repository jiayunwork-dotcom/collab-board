(function() {
  'use strict';

  const TRIGGER_ID = '__word_cloud_trigger_';
  const CLOUD_GROUP_PREFIX = '__word_cloud_group_';

  const STOPWORDS = new Set([
    '的', '了', '和', '是', '在', '我', '有', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    '自己', '这', '他', '她', '它', '那', '被', '给', '让', '但', '但', '而', '与',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'of', 'in', 'to', 'for',
    'with', 'on', 'at', 'from', 'by', 'about', 'as', 'into', 'through',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
    'too', 'very', 'just', 'because', 'if', 'then', 'else', 'when',
    'where', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
    'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
    'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'us',
  ]);

  function isOurElement(el) {
    const id = el.id;
    if (id && (id === TRIGGER_ID || id.startsWith(CLOUD_GROUP_PREFIX))) {
      return true;
    }
    const text = el.data && el.data.text;
    if (text && (text === '☁️ 生成词云' || (typeof text === 'string' && text.startsWith('#WC:')))) {
      return true;
    }
    return false;
  }

  function extractWords(text) {
    if (!text || typeof text !== 'string') return [];
    const cleaned = text.toLowerCase()
      .replace(/[\s\u3000]+/g, ' ')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .trim();

    const words = [];

    const chineseRegex = /[\u4e00-\u9fa5]{2,}/g;
    let match;
    while ((match = chineseRegex.exec(cleaned)) !== null) {
      words.push(match[0]);
      const phrase = match[0];
      for (let i = 0; i < phrase.length - 1; i++) {
        words.push(phrase.substring(i, i + 2));
      }
    }

    const englishRegex = /[a-zA-Z0-9]{2,}/g;
    while ((match = englishRegex.exec(cleaned)) !== null) {
      words.push(match[0].toLowerCase());
    }

    return words;
  }

  function countWords(elements) {
    const freq = new Map();

    for (const el of elements) {
      if (isOurElement(el)) continue;
      const text = el.data && (el.data.text || el.data.noteContent);
      if (!text) continue;

      const words = extractWords(text);
      for (const w of words) {
        if (STOPWORDS.has(w.toLowerCase())) continue;
        if (w.length < 2) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);
  }

  const COLORS = [
    '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F97316',
    '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#14B8A6',
    '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#A855F7',
  ];

  function calculateWordCloudLayout(wordFreq) {
    if (wordFreq.length === 0) return [];

    const maxFreq = wordFreq[0][1];
    const minFreq = wordFreq[wordFreq.length - 1][1];
    const freqRange = maxFreq - minFreq || 1;

    const results = [];
    const placed = [];

    const centerX = 0;
    const centerY = 0;

    const layoutWords = [];

    for (let i = 0; i < wordFreq.length; i++) {
      const [word, count] = wordFreq[i];
      const normalized = (count - minFreq) / freqRange;
      const fontSize = Math.max(12, Math.round(12 + normalized * 48));
      const width = Math.max(word.length * fontSize * 0.55, 30);
      const height = fontSize * 1.3;
      const color = COLORS[i % COLORS.length];
      const weight = normalized > 0.6;
      const rotate = normalized < 0.3 && i % 3 === 0;

      layoutWords.push({
        word, count, normalized, fontSize,
        width, height, color, weight, rotate,
      });
    }

    layoutWords.sort((a, b) => b.fontSize - a.fontSize);

    for (const w of layoutWords) {
      let placedOk = false;

      for (let attempt = 0; attempt < 500 && !placedOk; attempt++) {
        const angle = attempt * 0.35;
        const radius = attempt * 2.5;
        const x = centerX + radius * Math.cos(angle) - w.width / 2;
        const y = centerY + radius * Math.sin(angle) - w.height / 2;

        let collision = false;
        const pad = 3;
        for (const p of placed) {
          const overlapX = (x + pad) < (p.x + p.width + pad) && (x + w.width + pad) > (p.x - pad);
          const overlapY = (y + pad) < (p.y + p.height + pad) && (y + w.height + pad) > (p.y - pad);
          if (overlapX && overlapY) {
            collision = true;
            break;
          }
        }

        if (!collision) {
          results.push({
            ...w,
            x, y,
          });
          placed.push({ x, y, width: w.width, height: w.height });
          placedOk = true;
        }
      }

      if (!placedOk) {
        results.push({
          ...w,
          x: (Math.random() - 0.5) * 300,
          y: (Math.random() - 0.5) * 300,
        });
      }
    }

    return results;
  }

  async function createWordCloud() {
    try {
      const allElements = await PluginAPI.canvas.getElements();
      const wordFreq = countWords(allElements);

      if (wordFreq.length === 0) {
        await PluginAPI.notification.show(
          '词云生成',
          '未找到足够的文本内容来生成词云。请先添加一些文本、便签或思维导图节点。'
        );
        return;
      }

      let viewport;
      try {
        viewport = await PluginAPI.canvas.getViewport();
      } catch (e) {
        viewport = { x: 0, y: 0, zoom: 1 };
      }

      const layout = calculateWordCloudLayout(wordFreq);
      const groupId = CLOUD_GROUP_PREFIX + Math.random().toString(36).slice(2, 9);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const w of layout) {
        minX = Math.min(minX, w.x);
        minY = Math.min(minY, w.y);
        maxX = Math.max(maxX, w.x + w.width);
        maxY = Math.max(maxY, w.y + w.height);
      }

      const cloudWidth = maxX - minX + 60;
      const cloudHeight = maxY - minY + 60;

      const baseX = viewport.x + 350 / viewport.zoom - cloudWidth / 2;
      const baseY = viewport.y + 250 / viewport.zoom - cloudHeight / 2;

      try {
        await PluginAPI.canvas.createElement('rectangle', {
          id: groupId + '_bg',
          x: baseX + minX - 30,
          y: baseY + minY - 30,
          width: cloudWidth,
          height: cloudHeight,
          data: {
            text: '',
            fillColor: 'rgba(248, 250, 252, 0.92)',
            strokeColor: '#CBD5E1',
            strokeWidth: 2,
            borderRadius: 16,
          },
          opacity: 0.95,
          locked: false,
          zIndex: 5000,
        });
      } catch (e) {}

      try {
        await PluginAPI.canvas.createElement('text', {
          id: groupId + '_title',
          x: baseX + minX - 20,
          y: baseY + minY - 28,
          width: 200,
          height: 22,
          data: {
            text: '☁️ 词云分析（共 ' + wordFreq.length + ' 个关键词）',
            fontSize: 13,
            color: '#475569',
            bold: true,
          },
          locked: false,
          zIndex: 5001,
        });
      } catch (e) {}

      let createdCount = 0;
      for (const w of layout) {
        try {
          await PluginAPI.canvas.createElement('text', {
            id: groupId + '_w_' + createdCount,
            x: baseX + w.x + 30,
            y: baseY + w.y + 30,
            width: w.width + 4,
            height: w.height + 4,
            data: {
              text: w.word,
              fontSize: w.fontSize,
              bold: w.weight,
              color: w.color,
              align: 'left',
            },
            opacity: 0.9,
            locked: false,
            zIndex: 5002 + createdCount,
            rotation: w.rotate ? -90 : 0,
          });
          createdCount++;
        } catch (e) {
          console.warn('[word-cloud] create element failed for:', w.word, e);
        }
      }

      try {
        await PluginAPI.notification.show(
          '☁️ 词云生成完成！',
          '已生成 ' + createdCount + ' 个词语。核心词：' +
          wordFreq.slice(0, 3).map(w => w[0]).join('、')
        );
      } catch (e) {}

    } catch (e) {
      console.error('[word-cloud] generation error:', e);
      try {
        await PluginAPI.notification.show(
          '词云生成失败',
          '发生错误：' + (e.message || String(e))
        );
      } catch (e2) {}
    }
  }

  async function showTriggerButton() {
    try {
      let vp;
      try {
        vp = await PluginAPI.canvas.getViewport();
      } catch (e) {
        vp = { x: 0, y: 0, zoom: 1 };
      }

      const btnX = vp.x + 350 / vp.zoom - 90;
      const btnY = vp.y + 30 / vp.zoom;

      await PluginAPI.canvas.createElement('rectangle', {
        id: TRIGGER_ID,
        x: btnX, y: btnY,
        width: 180, height: 40,
        data: {
          text: '☁️ 生成词云分析',
          fillColor: '#ECFDF5',
          strokeColor: '#10B981',
          strokeWidth: 2,
          fontSize: 13,
          color: '#047857',
          bold: true,
          align: 'center',
          borderRadius: 10,
        },
        opacity: 0.95,
        locked: true,
        zIndex: 9998,
      });
    } catch (e) {
      console.error('[word-cloud] create trigger failed:', e);
    }
  }

  PluginAPI.on('element:updated', function(el) {
    if (el && el.id === TRIGGER_ID) {
      createWordCloud();
    }
  });

  PluginAPI.on('viewport:changed', function() {
    showTriggerButton();
  });

  async function init() {
    await showTriggerButton();
    console.log('[word-cloud] Plugin loaded! ☁️ Click the "Generate Word Cloud" button to analyze text on canvas.');
  }

  init();
})();
