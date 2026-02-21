#!/usr/bin/env node
/**
 * LINE公式アカウント チャット履歴CSVを解析してQ&Aパターンを抽出するスクリプト
 * 使い方: node scripts/analyze_line_chats.js
 */

const fs = require('fs');
const path = require('path');

const TRAINING_DIR = path.join(__dirname, '..', 'training_data');
const OUTPUT_FILE = path.join(TRAINING_DIR, 'qa_summary.json');
const OUTPUT_TEXT = path.join(TRAINING_DIR, 'qa_summary.txt');

// CSVを手動パース（セル内改行・カンマ対応）
function parseCSV(content) {
  const lines = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === '\n' && !inQuote) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  return lines.map(line => {
    const cols = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cols.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cols.push(cell.trim());
    return cols;
  });
}

// 会話ファイルを解析してメッセージ配列を返す
function parseConversation(filePath) {
  let content;
  try {
    // UTF-8で試みる
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  // BOM除去
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  const rows = parseCSV(content);

  // 4行目がヘッダー（0始まりで index 3）
  // それ以降がデータ
  const messages = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;

    const senderType = row[0]; // Account / User
    const senderName = row[1];
    const date = row[2];
    const time = row[3];
    const content = row[4];

    if (!senderType || !content) continue;
    if (senderType !== 'Account' && senderType !== 'User') continue;

    messages.push({
      senderType,
      senderName,
      date,
      time,
      content: content.replace(/\r/g, '').trim(),
    });
  }

  return messages;
}

// メッセージ配列からQ&Aペアを抽出
function extractQAPairs(messages) {
  const pairs = [];
  let i = 0;

  while (i < messages.length) {
    if (messages[i].senderType === 'User') {
      const question = messages[i].content;

      // 次のAccountメッセージを探す
      let j = i + 1;
      while (j < messages.length && messages[j].senderType === 'User') {
        j++;
      }

      if (j < messages.length && messages[j].senderType === 'Account') {
        // 応答メッセージ（自動挨拶）は除外
        const answer = messages[j].content;
        if (question.length > 5 && answer.length > 5) {
          pairs.push({ question, answer });
        }
      }

      i = j + 1;
    } else {
      i++;
    }
  }

  return pairs;
}

// キーワードで質問をカテゴリ分類
function categorize(question) {
  const q = question;
  if (/買取|売|いくら|値段|価格|相場/.test(q)) return '買取価格';
  if (/ポケモン|ポケカ/.test(q)) return 'ポケモンカード';
  if (/ワンピース/.test(q)) return 'ワンピースカード';
  if (/遊戯王|遊戲王/.test(q)) return '遊戯王';
  if (/デュエマ|デュエル/.test(q)) return 'デュエルマスターズ';
  if (/ドラゴンボール|DB/.test(q)) return 'ドラゴンボール';
  if (/発送|郵送|送料|配送/.test(q)) return '発送・配送';
  if (/梱包|包み|段ボール/.test(q)) return '梱包';
  if (/入金|振込|支払|いつ/.test(q)) return '入金・支払い';
  if (/キャンセル|断|やめ/.test(q)) return 'キャンセル';
  if (/状態|傷|折れ|汚/.test(q)) return 'カード状態';
  if (/まとめ|セット|箱|パック/.test(q)) return 'まとめ売り';
  if (/査定|確認|チェック/.test(q)) return '査定';
  if (/申込|申し込み|手順|方法|やり方/.test(q)) return '申込方法';
  return 'その他';
}

// メイン処理
function main() {
  if (!fs.existsSync(TRAINING_DIR)) {
    console.error(`training_data/ ディレクトリが見つかりません: ${TRAINING_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(TRAINING_DIR).filter(f => f.endsWith('.csv'));

  if (files.length === 0) {
    console.log('CSVファイルが見つかりません。training_data/ にファイルを置いてください。');
    return;
  }

  console.log(`${files.length}個のCSVファイルを解析中...`);

  const allPairs = [];
  const categoryCounts = {};

  files.forEach((file, idx) => {
    const filePath = path.join(TRAINING_DIR, file);
    const messages = parseConversation(filePath);
    const pairs = extractQAPairs(messages);
    allPairs.push(...pairs);

    if ((idx + 1) % 50 === 0) {
      console.log(`  ${idx + 1}/${files.length} 処理済み...`);
    }
  });

  // カテゴリ別集計
  allPairs.forEach(pair => {
    const cat = categorize(pair.question);
    pair.category = cat;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  // JSON出力
  const output = {
    total_files: files.length,
    total_qa_pairs: allPairs.length,
    category_counts: categoryCounts,
    qa_pairs: allPairs,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  // テキスト出力（カテゴリ別）
  let text = `=== LINE チャット Q&A 解析結果 ===\n`;
  text += `解析ファイル数: ${files.length}\n`;
  text += `抽出Q&Aペア数: ${allPairs.length}\n\n`;
  text += `--- カテゴリ別件数 ---\n`;

  const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([cat, count]) => {
    text += `  ${cat}: ${count}件\n`;
  });

  text += `\n--- カテゴリ別Q&Aサンプル（各最大5件） ---\n`;
  sorted.forEach(([cat]) => {
    const samples = allPairs.filter(p => p.category === cat).slice(0, 5);
    text += `\n【${cat}】\n`;
    samples.forEach((p, i) => {
      text += `Q${i + 1}: ${p.question.slice(0, 100)}\n`;
      text += `A${i + 1}: ${p.answer.slice(0, 100)}\n\n`;
    });
  });

  fs.writeFileSync(OUTPUT_TEXT, text, 'utf8');

  console.log('\n=== 解析完了 ===');
  console.log(`Q&Aペア総数: ${allPairs.length}件`);
  console.log('\nカテゴリ別件数:');
  sorted.forEach(([cat, count]) => console.log(`  ${cat}: ${count}件`));
  console.log(`\n結果を保存しました:`);
  console.log(`  ${OUTPUT_FILE}`);
  console.log(`  ${OUTPUT_TEXT}`);
}

main();
